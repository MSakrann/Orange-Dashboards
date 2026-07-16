import { NextResponse } from "next/server";
import {
  assertCronAuthorized,
  getJiraConnectionForSlug,
  listConfiguredJiraWorkspaces,
} from "@/lib/jira/config";
import { syncWorkspaceFromJira } from "@/lib/jira/sync-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }

  const configured = listConfiguredJiraWorkspaces();
  if (!configured.length) {
    return NextResponse.json(
      { error: "No Jira workspaces are configured in environment variables." },
      { status: 500 },
    );
  }

  const results = [];
  const failures: Array<{ workspaceSlug: string; error: string }> = [];

  for (const config of configured) {
    try {
      results.push(await syncWorkspaceFromJira(config));
    } catch (error) {
      failures.push({
        workspaceSlug: config.workspaceSlug,
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  return NextResponse.json({ results, failures });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const workspaceSlug = url.searchParams.get("workspace");

  if (workspaceSlug) {
    const config = getJiraConnectionForSlug(workspaceSlug);
    if (!config) {
      return NextResponse.json({ error: "Unknown or unconfigured workspace." }, { status: 400 });
    }

    try {
      assertCronAuthorized(request);
      const result = await syncWorkspaceFromJira(config);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Sync failed" },
        { status: error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500 },
      );
    }
  }

  return GET(request);
}
