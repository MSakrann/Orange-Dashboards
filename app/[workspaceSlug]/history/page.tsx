import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryFilters } from "@/components/history/history-filters";
import { HistoryList } from "@/components/history/history-list";
import { HistoryPagination } from "@/components/history/history-pagination";
import {
  historyAccessRedirect,
  HistoryDataError,
  loadHistory,
  loadHistoryActors,
  parseHistoryFilters,
  resolveHistoryWorkspace,
} from "@/lib/data/history";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceSlug } = await params;
  const workspacePath = `/${encodeURIComponent(workspaceSlug)}`;
  const historyPath = `${workspacePath}/history`;
  const envConfigured = hasSupabasePublicEnv();

  if (!envConfigured) redirect(workspacePath);

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authenticated = !userError && Boolean(userData.user);
  const admin = authenticated ? await getAdminStatus(supabase) : false;
  const deniedRedirect = historyAccessRedirect(
    { envConfigured, authenticated, admin },
    { workspacePath, historyPath },
  );
  if (deniedRedirect) redirect(deniedRedirect);

  const filters = parseHistoryFilters(await searchParams);
  let identity;
  let result;
  let actors;
  try {
    identity = await resolveHistoryWorkspace(supabase, workspaceSlug);
    if (!identity) redirect(workspacePath);
    [result, actors] = await Promise.all([
      loadHistory(supabase, workspaceSlug, filters),
      loadHistoryActors(supabase, workspaceSlug),
    ]);
  } catch (error) {
    if (!(error instanceof HistoryDataError)) throw error;
    return (
      <main className="history-page">
        <h1>Activity history</h1>
        <p role="alert">History could not be loaded safely.</p>
        <Link href={workspacePath}>Back to workspace</Link>
      </main>
    );
  }

  return (
    <main className="history-page">
      <header className="history-page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Activity history</h1>
          <p>{identity.name} · Immutable administrative activity</p>
        </div>
        <nav aria-label="Admin navigation">
          <Link href={workspacePath}>Dashboard</Link>
          <Link href={`${workspacePath}/settings/statuses`}>Status settings</Link>
        </nav>
      </header>
      <HistoryFilters filters={filters} historyPath={historyPath} actors={actors} />
      <HistoryList entries={result.entries} />
      <HistoryPagination
        filters={filters}
        historyPath={historyPath}
        result={result}
      />
    </main>
  );
}
