import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/auth/return-to";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnTo = safeReturnTo(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(returnTo, url.origin));
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("error", "callback");
  loginUrl.searchParams.set("next", returnTo);
  return NextResponse.redirect(loginUrl);
}
