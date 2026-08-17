import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeptEditor } from "@/components/dept-structure/edit/dept-editor";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { loadDeptStructure } from "@/lib/data/dept-structure";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit Department Structure" };
export const dynamic = "force-dynamic";

export default async function DeptStructureEditPage() {
  if (!hasSupabasePublicEnv()) redirect("/dept-structure");

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect(`/login?next=${encodeURIComponent("/dept-structure/edit")}`);
  }

  if (!(await getAdminStatus(supabase))) redirect("/dept-structure");

  const data = await loadDeptStructure(supabase);
  return <DeptEditor initial={data} />;
}
