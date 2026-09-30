import type { JiraWorkspaceSlug } from "@/lib/jira/types";

/** Dashboard labels that differ from Jira status names for a workspace. */
const STATUS_DISPLAY_ALIASES: Partial<Record<JiraWorkspaceSlug, Record<string, string>>> = {
  "development-operations": {
    "to do": "Planning",
    "in review": "Delayed",
  },
  "platform-development": {
    "to do": "Planning",
    "in review": "In Progress",
    "pending": "Delayed",
  },
};

/** Preferred KPI/filter order for known status labels (case-insensitive). */
const STATUS_SORT_ORDER: Partial<Record<JiraWorkspaceSlug, string[]>> = {
  "development-operations": ["Planning", "In Progress", "Done", "Delayed"],
  "platform-development": ["Planning", "In Progress", "Done", "Delayed"],
};

export function displayStatusName(workspaceSlug: string, jiraStatusName: string): string {
  const aliases = STATUS_DISPLAY_ALIASES[workspaceSlug as JiraWorkspaceSlug];
  if (!aliases) return jiraStatusName;
  return aliases[jiraStatusName.trim().toLowerCase()] ?? jiraStatusName;
}

export function preferredStatusSortOrder(workspaceSlug: string): string[] | null {
  return STATUS_SORT_ORDER[workspaceSlug as JiraWorkspaceSlug] ?? null;
}

/** Returns id -> sort_order updates needed to match the workspace preferred order. */
export function statusSortUpdates(
  workspaceSlug: string,
  statuses: Array<{ id: string; name: string; sort_order: number }>,
): Array<{ id: string; sort_order: number }> {
  const preferred = preferredStatusSortOrder(workspaceSlug);
  if (!preferred?.length) return [];

  const rank = new Map(preferred.map((name, index) => [name.toLowerCase(), index]));
  const known = statuses
    .filter((status) => rank.has(status.name.trim().toLowerCase()))
    .sort((a, b) => {
      const aRank = rank.get(a.name.trim().toLowerCase()) ?? 0;
      const bRank = rank.get(b.name.trim().toLowerCase()) ?? 0;
      return aRank - bRank;
    });
  const unknown = statuses
    .filter((status) => !rank.has(status.name.trim().toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  return [...known, ...unknown]
    .map((status, sort_order) => ({ id: status.id, sort_order }))
    .filter((update) => {
      const current = statuses.find((status) => status.id === update.id);
      return current?.sort_order !== update.sort_order;
    });
}
