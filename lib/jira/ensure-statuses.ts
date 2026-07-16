import {
  colorForReportingCategory,
  inferReportingCategory,
  uniqueJiraStatuses,
  type StatusRow,
} from "@/lib/jira/resolve-status";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Create/update workspace statuses so their names match Jira exactly.
 * Reporting category is inferred only for KPIs/filters — the visible label is the Jira name.
 */
export async function ensureJiraNamedStatuses(
  supabase: ServiceClient,
  workspaceId: string,
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
    const key = jiraStatus.name.toLowerCase();
    const reportingCategory = inferReportingCategory(
      jiraStatus.name,
      jiraStatus.categoryKey,
    );
    const color = colorForReportingCategory(reportingCategory);
    const existing = byName.get(key);

    if (existing) {
      if (
        existing.reporting_category !== reportingCategory
        || (existing.color && existing.color !== color)
      ) {
        const { error } = await supabase
          .from("statuses")
          .update({
            reporting_category: reportingCategory,
            color,
            name: jiraStatus.name,
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        existing.reporting_category = reportingCategory;
        existing.color = color;
        existing.name = jiraStatus.name;
      }
      nameToId.set(key, existing.id);
      continue;
    }

    const sortOrder = nextSort;
    nextSort += 1;
    const { data, error } = await supabase
      .from("statuses")
      .insert({
        workspace_id: workspaceId,
        name: jiraStatus.name,
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
    byName.set(key, created);
    nameToId.set(key, created.id);
  }

  return nameToId;
}

export async function removeUnusedSeedStatuses(
  supabase: ServiceClient,
  workspaceId: string,
  keepStatusIds: Set<string>,
) {
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
