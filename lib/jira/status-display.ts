import type { JiraWorkspaceSlug } from "@/lib/jira/types";

/** Dashboard labels that differ from Jira status names for a workspace. */
const STATUS_DISPLAY_ALIASES: Partial<Record<JiraWorkspaceSlug, Record<string, string>>> = {
  "development-operations": {
    "to do": "Planning",
    "in review": "Delayed",
  },
};

export function displayStatusName(workspaceSlug: string, jiraStatusName: string): string {
  const aliases = STATUS_DISPLAY_ALIASES[workspaceSlug as JiraWorkspaceSlug];
  if (!aliases) return jiraStatusName;
  return aliases[jiraStatusName.trim().toLowerCase()] ?? jiraStatusName;
}
