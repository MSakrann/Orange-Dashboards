import type { JiraConnectionConfig, JiraWorkspaceSlug } from "@/lib/jira/types";

const JIRA_WORKSPACE_SLUGS: JiraWorkspaceSlug[] = [
  "pe-development",
  "platform-development",
  "pe-operations",
  "development-operations",
  "datalake-operations",
];

const JIRA_ENV_PREFIX_BY_SLUG: Record<JiraWorkspaceSlug, string> = {
  "pe-development": "JIRA_PE",
  "platform-development": "JIRA_PLATFORM",
  "pe-operations": "JIRA_PE_OPS",
  "development-operations": "JIRA_DEV_OPS",
  "datalake-operations": "JIRA_DATALAKE_OPS",
};

function envPrefixForSlug(slug: JiraWorkspaceSlug): string {
  return JIRA_ENV_PREFIX_BY_SLUG[slug];
}

export function isJiraWorkspaceSlug(slug: string): slug is JiraWorkspaceSlug {
  return JIRA_WORKSPACE_SLUGS.includes(slug as JiraWorkspaceSlug);
}

export function getJiraConnectionForSlug(slug: string): JiraConnectionConfig | null {
  if (!isJiraWorkspaceSlug(slug)) return null;

  const prefix = envPrefixForSlug(slug);
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.replace(/\/$/, "");
  const email = process.env[`${prefix}_EMAIL`];
  const apiToken = process.env[`${prefix}_API_TOKEN`];
  const jql = process.env[`${prefix}_JQL`];
  const webhookSecret = process.env[`${prefix}_WEBHOOK_SECRET`];
  const progressFieldId = process.env[`${prefix}_PROGRESS_FIELD_ID`];

  if (!baseUrl || !email || !apiToken || !jql || !webhookSecret) {
    return null;
  }

  return {
    workspaceSlug: slug,
    baseUrl,
    email,
    apiToken,
    jql,
    webhookSecret,
    ...(progressFieldId ? { progressFieldId } : {}),
  };
}

export function listConfiguredJiraWorkspaces(): JiraConnectionConfig[] {
  return JIRA_WORKSPACE_SLUGS
    .map((slug) => getJiraConnectionForSlug(slug))
    .filter((config): config is JiraConnectionConfig => config !== null);
}

export function assertCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is not configured.");
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    throw new Error("Unauthorized cron request.");
  }
}
