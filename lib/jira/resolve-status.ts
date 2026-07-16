import type { ReportingCategory } from "@/lib/data/dashboard";

export interface StatusRow {
  id: string;
  name: string;
  reporting_category: string;
  sort_order: number;
  color?: string;
}

const ALIAS_TO_CATEGORY: Array<{ match: RegExp; category: ReportingCategory }> = [
  { match: /\b(done|closed|resolved|complete|completed|cancelled|canceled|shipped)\b/i, category: "completed" },
  { match: /\b(block|blocked|impediment|at[- ]?risk|on hold|waiting|stuck)\b/i, category: "risk" },
  { match: /\b(delay|delayed|overdue|slipped)\b/i, category: "delayed" },
  { match: /\b(to[- ]?do|backlog|open|new|ready|selected|triage|grooming)\b/i, category: "active" },
  { match: /\b(progress|review|develop|dev|qa|test|doing|in flight|active)\b/i, category: "active" },
];

const CATEGORY_COLORS: Record<ReportingCategory, string> = {
  active: "#23b123",
  risk: "#f59e0b",
  delayed: "#ef4444",
  completed: "#16a34a",
};

export function inferReportingCategory(
  jiraStatusName: string,
  jiraStatusCategoryKey?: string | null,
): ReportingCategory {
  for (const alias of ALIAS_TO_CATEGORY) {
    if (alias.match.test(jiraStatusName)) return alias.category;
  }

  switch (jiraStatusCategoryKey) {
    case "done":
      return "completed";
    case "new":
    case "indeterminate":
      return "active";
    default:
      return "active";
  }
}

export function colorForReportingCategory(category: ReportingCategory) {
  return CATEGORY_COLORS[category];
}

export function uniqueJiraStatuses(
  issues: Array<{ jiraStatusName: string; jiraStatusCategoryKey: string | null }>,
) {
  const byName = new Map<string, { name: string; categoryKey: string | null }>();
  for (const issue of issues) {
    const name = issue.jiraStatusName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, { name, categoryKey: issue.jiraStatusCategoryKey });
    }
  }
  return [...byName.values()];
}
