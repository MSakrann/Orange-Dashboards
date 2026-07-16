import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv, hasSupabasePublicEnv } from "@/lib/supabase/env";

const variables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearPublicEnv() {
  variables.forEach((name) => vi.stubEnv(name, ""));
}

describe("Supabase public environment", () => {
  it("uses fixture mode only when URL and both supported keys are absent", () => {
    clearPublicEnv();

    expect(hasSupabasePublicEnv()).toBe(false);
  });

  it("accepts a URL with the preferred publishable key", () => {
    clearPublicEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");

    expect(hasSupabasePublicEnv()).toBe(true);
    expect(getSupabaseEnv()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable-test-key",
    });
  });

  it("accepts a URL with the legacy anon key", () => {
    clearPublicEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-test-key");

    expect(hasSupabasePublicEnv()).toBe(true);
    expect(getSupabaseEnv().publishableKey).toBe("legacy-test-key");
  });

  it.each([
    {
      name: "URL without a key",
      values: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    },
    {
      name: "key without a URL",
      values: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key" },
    },
  ])("fails loudly for partial configuration: $name", ({ values }) => {
    clearPublicEnv();
    Object.entries(values).forEach(([name, value]) => vi.stubEnv(name, value));

    expect(() => hasSupabasePublicEnv()).toThrow(/Incomplete Supabase public configuration/);
  });
});
