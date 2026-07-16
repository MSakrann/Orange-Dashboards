function readSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || "";

  return { url, publishableKey };
}

export function hasSupabasePublicEnv() {
  const { url, publishableKey } = readSupabasePublicEnv();
  if (!url && !publishableKey) return false;
  if (!url || !publishableKey) {
    throw new Error(
      "Incomplete Supabase public configuration. Set NEXT_PUBLIC_SUPABASE_URL and "
      + "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY), "
      + "or remove all three variables to use the read-only fixture.",
    );
  }
  return true;
}

export function getSupabaseEnv() {
  const { url, publishableKey } = readSupabasePublicEnv();

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Set it before creating a Supabase client.",
    );
  }

  if (!publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY). Set it before creating a Supabase client.",
    );
  }

  return { url, publishableKey };
}
