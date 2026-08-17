import type { Metadata } from "next";
import { DeptPortfolio } from "@/components/dept-structure/dept-portfolio";
import { loadDeptStructure } from "@/lib/data/dept-structure";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Department Structure",
  description: "Orange Egypt technology delivery department portfolio.",
};

export const dynamic = "force-dynamic";

export default async function DeptStructurePage() {
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  const data = await loadDeptStructure(client);
  return <DeptPortfolio data={data} />;
}
