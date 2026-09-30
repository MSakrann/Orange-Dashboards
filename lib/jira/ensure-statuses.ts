import {
  colorForReportingCategory,
  inferReportingCategory,
  uniqueJiraStatuses,
  type StatusRow,
} from "@/lib/jira/resolve-status";
import { displayStatusName } from "@/lib/jira/status-display";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Create/update workspace statuses for Jira sync.
 * Visible labels usually match Jira; some workspaces override labels via display aliases.
 * Reporting category is still inferred from the Jira status name.
 */
export async function ensureJiraNamedStatuses(
  supabase: ServiceClient,
  workspaceId: string,
  workspaceSlug: string,
  existingStatuses: StatusRow[],
  issues: Array<{ jiraStatusName: string; jiraStatusCategoryKey: string | null }>,
): Promise<Map<string, string>> {
  const statuses = [...existingStatuses];
  const byName = new Map(
    statuses.map((status) => [status.name.trim().toLowerCase(), status]),
  );
  let nextSort = statuses.reduce((max, status) => Math.max(max, status.sort_order + 1), 0);
  const nameToId = new Map<string, string>();

  for (const jiraStatus of uniqueJiraStatuses(issues)) {
    const jiraKey = jiraStatus.name.toLowerCase();
    const label = displayStatusName(workspaceSlug, jiraStatus.name);
    const labelKey = label.toLowerCase();
    const reportingCategory = inferReportingCategory(
      jiraStatus.name,
      jiraStatus.categoryKey,
    );
    const color = colorForReportingCategory(reportingCategory);

    const byJiraName = byName.get(jiraKey);
    const byLabel = byName.get(labelKey);
    let existing = byJiraName;
    if (byJiraName && byLabel && byJiraName.id !== byLabel.id) {
      // Prefer the already-labelled status so we do not create a name collision.
      existing = byLabel;
    } else if (!existing && byLabel) {
      existing = byLabel;
    }

    if (existing) {
      const needsUpdate =
        existing.name !== label
        || existing.reporting_category !== reportingCategory
        || (existing.color && existing.color !== color);
      if (needsUpdate) {
        const { error } = await supabase
          .from("statuses")
          .update({
            reporting_category: reportingCategory,
            color,
            name: label,
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        if (existing.name.toLowerCase() !== labelKey) {
          byName.delete(existing.name.trim().toLowerCase());
        }
        existing.reporting_category = reportingCategory;
        existing.color = color;
        existing.name = label;
        byName.set(labelKey, existing);
      }
      nameToId.set(jiraKey, existing.id);
      continue;
    }

    const sortOrder = nextSort;
    nextSort += 1;
    const { data, error } = await supabase
      .from("statuses")
      .insert({
        workspace_id: workspaceId,
        name: label,
        color,
        sort_order: sortOrder,
        reporting_category: reportingCategory,
      })
      .select("id, name, reporting_category, sort_order, color")
      .single();
    if (error) throw new Error(error.message);

    const created: StatusRow = {
      id: data.id,
      name: data.name,
      reporting_category: data.reporting_category,
      sort_order: data.sort_order,
      color: data.color,
    };
    statuses.push(created);
    byName.set(labelKey, created);
    nameToId.set(jiraKey, created.id);
  }

  return nameToId;
}

export async function removeUnusedSeedStatuses(
  supabase: ServiceClient,
  workspaceId: string,
  keepStatusIds: Set<string>,
) {
  // Empty sync (0 Jira issues) yields an empty keep set. Never wipe the
  // workspace's statuses in that case — otherwise the next sync fails with
  // "No statuses configured".
  if (keepStatusIds.size === 0) return;

  const { data: rows, error } = await supabase
    .from("statuses")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  const candidates = (rows ?? [])
    .map((row) => row.id)
    .filter((id) => !keepStatusIds.has(id));
  if (!candidates.length) return;

  const { data: used, error: usedError } = await supabase
    .from("work_items")
    .select("status_id")
    .eq("workspace_id", workspaceId)
    .in("status_id", candidates);
  if (usedError) throw new Error(usedError.message);

  const stillUsed = new Set((used ?? []).map((row) => row.status_id));
  const deletable = candidates.filter((id) => !stillUsed.has(id));
  if (!deletable.length) return;

  const { error: deleteError } = await supabase
    .from("statuses")
    .delete()
    .in("id", deletable);
  if (deleteError) throw new Error(deleteError.message);
}
