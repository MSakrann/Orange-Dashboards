import type {
  JiraConnectionConfig,
  JiraIssue,
  JiraSearchResponse,
} from "@/lib/jira/types";

function authHeader(config: JiraConnectionConfig) {
  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function baseIssueFields(config: JiraConnectionConfig) {
  const fields = [
    "summary",
    "description",
    "status",
    "assignee",
    "duedate",
    "parent",
    "issuetype",
    "created",
    "updated",
    "priority",
  ];
  if (config.progressFieldId) {
    fields.push(config.progressFieldId);
  }
  if (config.targetDateFieldId) {
    fields.push(config.targetDateFieldId);
  }
  return fields;
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

interface JiraFieldDescriptor {
  id: string;
  name?: string;
  key?: string;
  clauseNames?: string[];
}

let epicLinkFieldCache = new Map<string, string | null>();
let targetEndFieldCache = new Map<string, string | null>();

/** Resolve the company-managed "Epic Link" custom field id for a Jira site. */
export async function resolveEpicLinkFieldId(
  config: JiraConnectionConfig,
): Promise<string | null> {
  const cached = epicLinkFieldCache.get(config.baseUrl);
  if (cached !== undefined) return cached;

  const fields = await jiraRequest<JiraFieldDescriptor[]>(config, "/rest/api/3/field");
  const match = fields.find((field) => {
    const name = (field.name ?? "").toLowerCase();
    const key = field.key ?? "";
    const clauses = field.clauseNames ?? [];
    return name === "epic link"
      || key === "com.pyxis.greenhopper.jira:gh-epic-link"
      || clauses.some((clause) => clause.toLowerCase() === "epic link");
  });

  const fieldId = match?.id ?? null;
  epicLinkFieldCache.set(config.baseUrl, fieldId);
  return fieldId;
}

/**
 * Resolve Advanced Roadmaps / planning "Target end" custom field when present.
 * Falls back to null so callers can use the standard Due Date field.
 */
export async function resolveTargetEndFieldId(
  config: JiraConnectionConfig,
): Promise<string | null> {
  if (config.targetDateFieldId) return config.targetDateFieldId;

  const cached = targetEndFieldCache.get(config.baseUrl);
  if (cached !== undefined) return cached;

  const fields = await jiraRequest<JiraFieldDescriptor[]>(config, "/rest/api/3/field");
  const match = fields.find((field) => {
    const name = (field.name ?? "").toLowerCase().trim();
    const clauses = (field.clauseNames ?? []).map((clause) => clause.toLowerCase());
    return name === "target end"
      || name === "target end date"
      || name === "target date"
      || clauses.includes("target end")
      || clauses.includes("target end date");
  });

  const fieldId = match?.id ?? null;
  targetEndFieldCache.set(config.baseUrl, fieldId);
  return fieldId;
}

/** Test helper — clears the Epic Link / Target end field caches. */
export function clearEpicLinkFieldCache() {
  epicLinkFieldCache = new Map();
  targetEndFieldCache = new Map();
}

function issueFields(
  config: JiraConnectionConfig,
  epicLinkFieldId?: string | null,
  targetEndFieldId?: string | null,
) {
  const fields = baseIssueFields(config);
  if (epicLinkFieldId) fields.push(epicLinkFieldId);
  if (targetEndFieldId && !fields.includes(targetEndFieldId)) {
    fields.push(targetEndFieldId);
  }
  return fields;
}

async function resolveIssueFieldIds(config: JiraConnectionConfig) {
  const [epicLinkFieldId, targetEndFieldId] = await Promise.all([
    resolveEpicLinkFieldId(config),
    resolveTargetEndFieldId(config),
  ]);
  return { epicLinkFieldId, targetEndFieldId };
}

export async function searchJiraIssues(config: JiraConnectionConfig): Promise<JiraIssue[]> {
  const { epicLinkFieldId, targetEndFieldId } = await resolveIssueFieldIds(config);
  const fields = issueFields(config, epicLinkFieldId, targetEndFieldId);
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      jql: config.jql,
      maxResults: 1000,
      fields,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const page = await jiraRequest<JiraSearchResponse>(
      config,
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    issues.push(...(page.issues ?? []));
    nextPageToken = page.isLast === true ? undefined : page.nextPageToken;
  } while (nextPageToken);

  return issues;
}

export async function fetchJiraIssue(
  config: JiraConnectionConfig,
  issueKey: string,
): Promise<JiraIssue> {
  const { epicLinkFieldId, targetEndFieldId } = await resolveIssueFieldIds(config);
  const params = new URLSearchParams({
    fields: issueFields(config, epicLinkFieldId, targetEndFieldId).join(","),
  });
  return jiraRequest<JiraIssue>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`,
  );
}

export function jiraIssueUrl(config: JiraConnectionConfig, issueKey: string) {
  return `${config.baseUrl}/browse/${issueKey}`;
}
