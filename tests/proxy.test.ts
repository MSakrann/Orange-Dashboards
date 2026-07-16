import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

import { proxy } from "@/proxy";

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: originalEnv.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: originalEnv.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: originalEnv.anonKey,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  createServerClient.mockReset();
});

describe("proxy", () => {
  it("bypasses Supabase session refresh when public env is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const request = new NextRequest("http://localhost/hot-topics");

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("retains Supabase auth refresh when public env is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    createServerClient.mockReturnValue({ auth: { getUser } });

    const response = await proxy(new NextRequest("http://localhost/hot-topics"));

    expect(response.status).toBe(200);
    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
