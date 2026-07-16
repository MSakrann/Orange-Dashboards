import { NextResponse } from "next/server";
import { getJiraConnectionForSlug, isJiraWorkspaceSlug } from "@/lib/jira/config";
import { syncWorkspaceFromJira } from "@/lib/jira/sync-workspace";

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

function isAuthorized(request: Request, expectedSecret: string) {
  const headerSecret = request.headers.get("x-dashboard-webhook-secret");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  return headerSecret === expectedSecret || querySecret === expectedSecret;
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

  if (!isAuthorized(request, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
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
