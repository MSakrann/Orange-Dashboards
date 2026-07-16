import { NextResponse } from "next/server";
import { getJiraConnectionForSlug, isJiraWorkspaceSlug } from "@/lib/jira/config";
import { syncWorkspaceFromJira } from "@/lib/jira/sync-workspace";
import { isWebhookAuthorized } from "@/lib/jira/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookParams {
  workspaceSlug: string;
}

function readIssueKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const issue = (payload as { issue?: { key?: string } }).issue;
  return issue?.key ?? null;
}

/** Health check for URL probes; Jira admin webhooks only need a valid HTTPS URL. */
export async function GET(
  _request: Request,
  context: { params: Promise<WebhookParams> },
) {
  const { workspaceSlug } = await context.params;
  if (!isJiraWorkspaceSlug(workspaceSlug)) {
    return NextResponse.json({ error: "Unsupported workspace." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, workspaceSlug });
}

export async function POST(
  request: Request,
  context: { params: Promise<WebhookParams> },
) {
  const { workspaceSlug } = await context.params;

  if (!isJiraWorkspaceSlug(workspaceSlug)) {
    return NextResponse.json({ error: "Unsupported workspace." }, { status: 404 });
  }

  const config = getJiraConnectionForSlug(workspaceSlug);
  if (!config) {
    return NextResponse.json({ error: "Jira is not configured for this workspace." }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!isWebhookAuthorized({
    request,
    rawBody,
    expectedSecret: config.webhookSecret,
  })) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const issueKey = readIssueKey(payload);
  if (!issueKey) {
    return NextResponse.json({ ok: true, skipped: "No issue key in webhook payload." });
  }

  try {
    const result = await syncWorkspaceFromJira(config, { issueKey });
    return NextResponse.json({ ok: true, issueKey, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook sync failed" },
      { status: 500 },
    );
  }
}
