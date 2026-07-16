import type { ReportingCategory } from "@/lib/data/dashboard";

interface DashboardStatusRow {
  id: string;
  name: string;
  reporting_category: string;
}

const ALIAS_TO_CATEGORY: Array<{ match: RegExp; category: ReportingCategory }> = [
  { match: /\b(done|closed|resolved|complete|completed|cancelled|canceled|shipped)\b/i, category: "completed" },
  { match: /\b(block|blocked|impediment|at[- ]?risk|on hold|waiting|stuck)\b/i, category: "risk" },
  { match: /\b(delay|delayed|overdue|slipped)\b/i, category: "delayed" },
  { match: /\b(to[- ]?do|backlog|open|new|ready|selected|triage|grooming)\b/i, category: "active" },
  { match: /\b(progress|review|develop|dev|qa|test|doing|in flight|active)\b/i, category: "active" },
];

function categoryFromJiraStatusCategory(key?: string | null): ReportingCategory | null {
  switch (key) {
    case "done":
      return "completed";
    case "new":
    case "indeterminate":
      return "active";
    default:
      return null;
  }
}

function categoryFromStatusName(name: string): ReportingCategory | null {
  for (const alias of ALIAS_TO_CATEGORY) {
    if (alias.match.test(name)) return alias.category;
  }
  return null;
}

export function resolveDashboardStatusId(options: {
  jiraStatusName: string;
  jiraStatusCategoryKey?: string | null;
  statuses: DashboardStatusRow[];
  mappings: Array<{ jira_status_name: string; status_id: string }>;
}): string {
  const { jiraStatusName, jiraStatusCategoryKey, statuses, mappings } = options;
  const normalized = jiraStatusName.trim().toLowerCase();

  const mapped = mappings.find(
    (entry) => entry.jira_status_name.trim().toLowerCase() === normalized,
  );
  if (mapped) return mapped.status_id;

  const byName = statuses.find((status) => status.name.trim().toLowerCase() === normalized);
  if (byName) return byName.id;

  const reportingCategory =
    categoryFromStatusName(jiraStatusName)
    ?? categoryFromJiraStatusCategory(jiraStatusCategoryKey)
    ?? "active";

  const byCategory = statuses.find((status) => status.reporting_category === reportingCategory);
  if (byCategory) return byCategory.id;

  return statuses[0]?.id ?? "";
}
