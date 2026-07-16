export type JiraWorkspaceSlug = "pe-development" | "platform-development";

export interface JiraConnectionConfig {
  workspaceSlug: JiraWorkspaceSlug;
  baseUrl: string;
  email: string;
  apiToken: string;
  jql: string;
  webhookSecret: string;
  progressFieldId?: string;
}

export interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  status?: { name?: string; statusCategory?: { key?: string } };
  assignee?: { displayName?: string } | null;
  duedate?: string | null;
  parent?: { id?: string; key?: string } | null;
  created?: string;
  updated?: string;
  priority?: { name?: string } | null;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
}

export interface MappedJiraIssue {
  jiraIssueId: string;
  jiraIssueKey: string;
  jiraUpdatedAt: string;
  title: string;
  description: string;
  assignee: string | null;
  endDate: string | null;
  startDate: string | null;
  priority: "low" | "medium" | "high";
  progress: number;
  jiraStatusName: string;
  jiraStatusCategoryKey: string | null;
  parentJiraIssueId: string | null;
}
