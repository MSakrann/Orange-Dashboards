import type { User } from "@supabase/supabase-js";
import { redirect as nextRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "./return-to";

export interface AdminAuthDependencies {
  getUser: () => Promise<Pick<User, "id" | "email"> | null>;
  isAdmin: (userId: string) => Promise<boolean>;
}

export interface AdminSession {
  user: Pick<User, "id" | "email">;
}

interface RequireAdminOptions {
  returnTo?: string | null;
  redirect?: (location: string) => never | void;
}

export type RequireAdminResult =
  | { ok: true; session: AdminSession }
  | { ok: false; status: 403 };

async function defaultDependencies(): Promise<AdminAuthDependencies> {
  const supabase = await createClient();

  return {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user;
    },
    async isAdmin() {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  };
}

export async function getAdminSession(
  dependencies?: AdminAuthDependencies,
): Promise<AdminSession | null> {
  const auth = dependencies ?? (await defaultDependencies());
  const user = await auth.getUser();

  if (!user || !(await auth.isAdmin(user.id))) return null;
  return { user };
}

export async function requireAdmin(
  dependencies?: AdminAuthDependencies,
  options: RequireAdminOptions = {},
): Promise<RequireAdminResult> {
  const auth = dependencies ?? (await defaultDependencies());
  const user = await auth.getUser();

  if (!user) {
    const next = safeReturnTo(options.returnTo);
    const redirect = options.redirect ?? nextRedirect;
    redirect(`/login?next=${encodeURIComponent(next)}`);
    return { ok: false, status: 403 };
  }

  if (!(await auth.isAdmin(user.id))) return { ok: false, status: 403 };
  return { ok: true, session: { user } };
}
