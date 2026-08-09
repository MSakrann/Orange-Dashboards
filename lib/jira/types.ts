export type JiraWorkspaceSlug =
  | "pe-development"
  | "platform-development"
  | "pe-operations"
  | "development-operations"
  | "datalake-operations";

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
  issuetype?: { name?: string; hierarchyLevel?: number } | null;
  created?: string;
  updated?: string;
  priority?: { name?: string } | null;
  /** Custom fields such as Epic Link / progress. */
  [customField: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
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
  parentJiraIssueKey: string | null;
  issueTypeName: string | null;
}
