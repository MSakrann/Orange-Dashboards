import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StatusManager } from "@/components/admin/statuses/status-manager";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { loadDashboard } from "@/lib/data/dashboard";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Status settings" };
export const dynamic = "force-dynamic";

export default async function StatusSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspacePath = `/${encodeURIComponent(workspaceSlug)}`;
  const settingsPath = `${workspacePath}/settings/statuses`;

  if (!hasSupabasePublicEnv()) redirect(workspacePath);

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect(`/login?next=${encodeURIComponent(settingsPath)}`);
  }

  if (!await getAdminStatus(supabase)) redirect(workspacePath);

  const dashboard = await loadDashboard(supabase, workspaceSlug);
  if (!dashboard) redirect(workspacePath);

  return <StatusManager initialDashboard={dashboard} />;
}
