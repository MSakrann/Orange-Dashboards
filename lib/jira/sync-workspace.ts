import { fetchJiraIssue, searchJiraIssues } from "@/lib/jira/client";
import type { JiraConnectionConfig } from "@/lib/jira/types";
import { mapJiraIssue } from "@/lib/jira/map-issue";
import { createServiceClient } from "@/lib/supabase/service";
import type { Tables } from "@/types/database";

interface SyncResult {
  workspaceSlug: string;
  imported: number;
  updated: number;
  deleted: number;
  skipped: number;
}

type WorkItemRow = Tables<"work_items">;

function sameWorkItem(existing: WorkItemRow, next: {
  title: string;
  description: string | null;
  status_id: string;
  priority: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  assignee: string | null;
  parent_id: string | null;
  sort_order: number;
  jira_updated_at: string | null;
}) {
  return existing.title === next.title
    && (existing.description ?? "") === (next.description ?? "")
    && existing.status_id === next.status_id
    && existing.priority === next.priority
    && existing.progress === next.progress
    && (existing.start_date ?? null) === next.start_date
    && (existing.end_date ?? null) === next.end_date
    && (existing.assignee ?? null) === next.assignee
    && (existing.parent_id ?? null) === next.parent_id
    && existing.sort_order === next.sort_order
    && (existing.jira_updated_at ?? null) === next.jira_updated_at;
}

async function loadWorkspaceContext(workspaceSlug: string) {
  const supabase = createServiceClient();

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (workspaceError) throw new Error(workspaceError.message);
  if (!workspace) throw new Error(`Workspace not found: ${workspaceSlug}`);

  const [{ data: statuses, error: statusesError }, { data: mappings, error: mappingsError }] =
    await Promise.all([
      supabase
        .from("statuses")
        .select("id, name, reporting_category, sort_order")
        .eq("workspace_id", workspace.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("jira_status_mappings")
        .select("jira_status_name, status_id")
        .eq("workspace_id", workspace.id),
    ]);

  if (statusesError) throw new Error(statusesError.message);
  if (mappingsError) throw new Error(mappingsError.message);
  if (!statuses?.length) throw new Error(`No statuses configured for ${workspaceSlug}`);

  const defaultStatus =
    statuses.find((status) => status.reporting_category === "active")
    ?? statuses[0];

  const statusByJiraName = new Map(
    (mappings ?? []).map((mapping) => [mapping.jira_status_name.toLowerCase(), mapping.status_id]),
  );
  const statusByDashboardName = new Map(
    statuses.map((status) => [status.name.toLowerCase(), status.id]),
  );

  function resolveStatusId(jiraStatusName: string) {
    const normalized = jiraStatusName.toLowerCase();
    return statusByJiraName.get(normalized)
      ?? statusByDashboardName.get(normalized)
      ?? defaultStatus.id;
  }

  return {
    supabase,
    workspace,
    statuses,
    resolveStatusId,
  };
}

async function beginJiraSync(supabase: ReturnType<typeof createServiceClient>) {
  const { error } = await supabase.rpc("begin_jira_sync_batch");
  if (error) {
    // Continue if the helper is unavailable; sync still works without audit suppression.
    console.warn("begin_jira_sync_batch failed:", error.message);
  }
}

export async function syncWorkspaceFromJira(
  config: JiraConnectionConfig,
  options?: { issueKey?: string },
): Promise<SyncResult> {
  const { supabase, workspace, resolveStatusId } = await loadWorkspaceContext(config.workspaceSlug);
  const issues = options?.issueKey
    ? [await fetchJiraIssue(config, options.issueKey)]
    : await searchJiraIssues(config);

  await beginJiraSync(supabase);

  const mapped = issues.map((issue) => mapJiraIssue(issue, config));
  const topLevel = mapped.filter((issue) => !issue.parentJiraIssueId);
  const subtasks = mapped.filter((issue) => issue.parentJiraIssueId);

  const { data: existingItems, error: existingError } = await supabase
    .from("work_items")
    .select("*")
    .eq("workspace_id", workspace.id);

  if (existingError) throw new Error(existingError.message);

  const existingByJiraId = new Map(
    (existingItems ?? [])
      .filter((item) => item.jira_issue_id)
      .map((item) => [item.jira_issue_id as string, item]),
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const seenJiraIds = new Set<string>();
  const jiraIdToWorkItemId = new Map<string, string>();

  async function upsertIssue(
    issue: ReturnType<typeof mapJiraIssue>,
    parentId: string | null,
    sortOrder: number,
  ) {
    seenJiraIds.add(issue.jiraIssueId);
    const payload = {
      workspace_id: workspace.id,
      parent_id: parentId,
      title: issue.title,
      description: issue.description || null,
      status_id: resolveStatusId(issue.jiraStatusName),
      priority: issue.priority,
      progress: issue.progress,
      start_date: issue.startDate,
      end_date: issue.endDate,
      assignee: issue.assignee,
      sort_order: sortOrder,
      sync_source: "jira" as const,
      jira_issue_id: issue.jiraIssueId,
      jira_issue_key: issue.jiraIssueKey,
      jira_updated_at: issue.jiraUpdatedAt,
    };

    const existing = existingByJiraId.get(issue.jiraIssueId);
    if (!existing) {
      const { data, error } = await supabase
        .from("work_items")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      jiraIdToWorkItemId.set(issue.jiraIssueId, data.id);
      imported += 1;
      return;
    }

    jiraIdToWorkItemId.set(issue.jiraIssueId, existing.id);
    if (sameWorkItem(existing, payload)) {
      skipped += 1;
      return;
    }

    const { error } = await supabase
      .from("work_items")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    updated += 1;
  }

  for (const [index, issue] of topLevel.entries()) {
    await upsertIssue(issue, null, index);
  }

  for (const [index, issue] of subtasks.entries()) {
    const parentWorkItemId = issue.parentJiraIssueId
      ? jiraIdToWorkItemId.get(issue.parentJiraIssueId)
      : undefined;
    if (!parentWorkItemId) continue;
    await upsertIssue(issue, parentWorkItemId, index);
  }

  let deleted = 0;
  if (!options?.issueKey) {
    const stale = (existingItems ?? []).filter(
      (item) => item.sync_source === "jira"
        && item.jira_issue_id
        && !seenJiraIds.has(item.jira_issue_id),
    );
    if (stale.length) {
      const { error } = await supabase
        .from("work_items")
        .delete()
        .in("id", stale.map((item) => item.id));
      if (error) throw new Error(error.message);
      deleted = stale.length;
    }
  }

  const syncError = null;
  const { error: settingsError } = await supabase
    .from("workspace_jira_settings")
    .upsert({
      workspace_id: workspace.id,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_sync_error: syncError,
      last_sync_issue_count: mapped.length,
    });

  if (settingsError) throw new Error(settingsError.message);

  return {
    workspaceSlug: config.workspaceSlug,
    imported,
    updated,
    deleted,
    skipped,
  };
}
