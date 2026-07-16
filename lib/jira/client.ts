import type {
  JiraConnectionConfig,
  JiraIssue,
  JiraSearchResponse,
} from "@/lib/jira/types";

function authHeader(config: JiraConnectionConfig) {
  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function issueFields(config: JiraConnectionConfig) {
  const fields = [
    "summary",
    "description",
    "status",
    "assignee",
    "duedate",
    "parent",
    "created",
    "updated",
    "priority",
  ];
  if (config.progressFieldId) {
    fields.push(config.progressFieldId);
  }
  return fields.join(",");
}

async function jiraRequest<T>(
  config: JiraConnectionConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(config),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export async function searchJiraIssues(config: JiraConnectionConfig): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      jql: config.jql,
      maxResults: "100",
      fields: issueFields(config),
    });
    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }

    const page = await jiraRequest<JiraSearchResponse>(
      config,
      `/rest/api/3/search/jql?${params.toString()}`,
    );
    issues.push(...(page.issues ?? []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);

  return issues;
}

export async function fetchJiraIssue(
  config: JiraConnectionConfig,
  issueKey: string,
): Promise<JiraIssue> {
  const params = new URLSearchParams({ fields: issueFields(config) });
  return jiraRequest<JiraIssue>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`,
  );
}

export function jiraIssueUrl(config: JiraConnectionConfig, issueKey: string) {
  return `${config.baseUrl}/browse/${issueKey}`;
}
