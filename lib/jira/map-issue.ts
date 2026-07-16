import type { JiraConnectionConfig, JiraIssue, MappedJiraIssue } from "@/lib/jira/types";

function extractDescription(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "content" in value) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function mapPriority(name?: string | null): "low" | "medium" | "high" {
  const normalized = (name ?? "").toLowerCase();
  if (normalized.includes("high") || normalized.includes("highest")) return "high";
  if (normalized.includes("low") || normalized.includes("lowest")) return "low";
  return "medium";
}

function progressFromStatusCategory(key?: string): number {
  switch (key) {
    case "new":
      return 0;
    case "indeterminate":
      return 50;
    case "done":
      return 100;
    default:
      return 25;
  }
}

function progressFromCustomField(issue: JiraIssue, fieldId?: string): number | null {
  if (!fieldId) return null;
  const raw = issue.fields[fieldId as keyof typeof issue.fields];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }
  return null;
}

export function mapJiraIssue(
  issue: JiraIssue,
  config: JiraConnectionConfig,
): MappedJiraIssue {
  const created = issue.fields.created?.slice(0, 10) ?? null;
  const progress =
    progressFromCustomField(issue, config.progressFieldId)
    ?? progressFromStatusCategory(issue.fields.status?.statusCategory?.key);

  return {
    jiraIssueId: issue.id,
    jiraIssueKey: issue.key,
    jiraUpdatedAt: issue.fields.updated ?? new Date().toISOString(),
    title: issue.fields.summary?.trim() || issue.key,
    description: extractDescription(issue.fields.description),
    assignee: issue.fields.assignee?.displayName?.trim() || null,
    endDate: issue.fields.duedate ?? null,
    startDate: created,
    priority: mapPriority(issue.fields.priority?.name),
    progress,
    jiraStatusName: issue.fields.status?.name?.trim() || "In Progress",
    jiraStatusCategoryKey: issue.fields.status?.statusCategory?.key ?? null,
    parentJiraIssueId: issue.fields.parent?.id ?? null,
  };
}
