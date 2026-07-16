import { describe, expect, it, vi } from "vitest";
import { getAdminStatus, resolveInitialDashboard } from "@/lib/data/initial-dashboard";
import type { DashboardViewModel } from "@/lib/data/dashboard";

const fixture: DashboardViewModel = {
  id: "fixture-alpha",
  slug: "alpha",
  name: "Fixture Alpha",
  description: "",
  statuses: [],
  statusGroups: { active: [], risk: [], delayed: [], completed: [] },
  projects: [],
  kpis: { total: 0, active: 0, needsAttention: 0, completed: 0, averageProgress: 0 },
};

describe("resolveInitialDashboard", () => {
  it("uses a clearly identified fixture only when public Supabase env is absent", async () => {
    const load = vi.fn();
    const result = await resolveInitialDashboard("alpha", {
      envConfigured: false,
      createClient: vi.fn(),
      load,
      getAdminStatus: vi.fn(),
      getFixture: vi.fn().mockReturnValue(fixture),
    });

    expect(result).toEqual({ dashboard: fixture, source: "fixture", isAdmin: false });
    expect(load).not.toHaveBeenCalled();
  });

  it("loads server data when public Supabase env is configured", async () => {
    const databaseDashboard = { ...fixture, name: "Database Alpha" };
    const client = { source: "server" };
    const result = await resolveInitialDashboard("alpha", {
      envConfigured: true,
      createClient: vi.fn().mockResolvedValue(client),
      load: vi.fn().mockResolvedValue(databaseDashboard),
      getAdminStatus: vi.fn().mockResolvedValue(true),
      getFixture: vi.fn(),
    });

    expect(result).toEqual({
      dashboard: databaseDashboard,
      source: "database",
      isAdmin: true,
    });
  });

  it("never falls back to fixtures after a configured query fails", async () => {
    const getFixture = vi.fn().mockReturnValue(fixture);
    await expect(resolveInitialDashboard("alpha", {
      envConfigured: true,
      createClient: vi.fn().mockResolvedValue({}),
      load: vi.fn().mockRejectedValue(new Error("database unavailable")),
      getAdminStatus: vi.fn().mockResolvedValue(false),
      getFixture,
    })).rejects.toThrow("database unavailable");

    expect(getFixture).not.toHaveBeenCalled();
  });

  it("keeps authenticated non-admin database viewers read-only", async () => {
    const result = await resolveInitialDashboard("alpha", {
      envConfigured: true,
      createClient: vi.fn().mockResolvedValue({}),
      load: vi.fn().mockResolvedValue(fixture),
      getAdminStatus: vi.fn().mockResolvedValue(false),
      getFixture: vi.fn(),
    });

    expect(result.isAdmin).toBe(false);
  });
});

describe("getAdminStatus", () => {
  it("fails closed for public sessions without calling the admin RPC", async () => {
    const rpc = vi.fn();
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      rpc,
    };

    await expect(getAdminStatus(client as never)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the server session and fails closed when the admin RPC errors", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-a" } },
      error: null,
    });
    const adminClient = {
      auth: { getUser },
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const errorClient = {
      auth: { getUser },
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } }),
    };

    await expect(getAdminStatus(adminClient as never)).resolves.toBe(true);
    await expect(getAdminStatus(errorClient as never)).resolves.toBe(false);
  });
});
