import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  admin: false,
  envConfigured: true,
  user: null as null | { id: string },
}));
const createClient = vi.hoisted(() => vi.fn());
const loadHistory = vi.hoisted(() => vi.fn());
const loadHistoryActors = vi.hoisted(() => vi.fn());
const resolveHistoryWorkspace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (location: string): never => {
    throw new Error(`redirect:${location}`);
  },
}));
vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => state.envConfigured,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/data/initial-dashboard", () => ({
  getAdminStatus: () => Promise.resolve(state.admin),
}));
vi.mock("@/lib/data/history", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/data/history")>(),
  loadHistory,
  loadHistoryActors,
  resolveHistoryWorkspace,
}));

import HistoryPage from "@/app/[workspaceSlug]/history/page";

describe("history page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.admin = false;
    state.envConfigured = true;
    state.user = null;
    createClient.mockResolvedValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: state.user },
          error: null,
        }),
      },
    });
    loadHistory.mockResolvedValue({
      entries: [],
      page: 1,
      pageCount: 1,
      pageSize: 25,
      snapshotAt: "2026-07-15T10:30:00.000Z",
      totalCount: 0,
    });
    loadHistoryActors.mockResolvedValue([{
      actorId: "90000000-0000-4000-8000-000000000001",
      displayName: "History Admin",
      email: "history-admin@test.local",
    }]);
    resolveHistoryWorkspace.mockResolvedValue(null);
  });

  const invoke = (slug = "hot-topics") => HistoryPage({
    params: Promise.resolve({ workspaceSlug: slug }),
    searchParams: Promise.resolve({}),
  });

  it("fails closed without environment configuration", async () => {
    state.envConfigured = false;
    await expect(invoke()).rejects.toThrow("redirect:/hot-topics");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("redirects anonymous and non-admin users safely", async () => {
    await expect(invoke()).rejects.toThrow(
      "redirect:/login?next=%2Fhot-topics%2Fhistory",
    );
    state.user = { id: "90000000-0000-4000-8000-000000000002" };
    await expect(invoke()).rejects.toThrow("redirect:/hot-topics");
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it("renders a dynamically-created deleted workspace for an authenticated admin", async () => {
    state.user = { id: "90000000-0000-4000-8000-000000000001" };
    state.admin = true;
    resolveHistoryWorkspace.mockResolvedValue({
      isDeleted: true,
      name: "Dynamic Deleted",
      slug: "dynamic-deleted",
      workspaceId: "81000000-0000-4000-8000-000000000040",
    });
    render(await invoke("dynamic-deleted"));
    expect(screen.getByRole("heading", { name: "Activity history" })).toBeInTheDocument();
    expect(screen.getByText(/Dynamic Deleted/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Actor" }))
      .toHaveTextContent("History Admin");
    expect(resolveHistoryWorkspace).toHaveBeenCalledWith(expect.anything(), "dynamic-deleted");
    expect(loadHistoryActors).toHaveBeenCalledWith(expect.anything(), "dynamic-deleted");
  });

  it("rejects unknown workspace slugs", async () => {
    state.user = { id: "90000000-0000-4000-8000-000000000001" };
    state.admin = true;
    await expect(invoke("unknown")).rejects.toThrow("redirect:/unknown");
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it("renders a controlled error for rejected RPC data", async () => {
    state.user = { id: "90000000-0000-4000-8000-000000000001" };
    state.admin = true;
    resolveHistoryWorkspace.mockResolvedValue({
      isDeleted: false,
      name: "Hot Topics",
      slug: "hot-topics",
      workspaceId: "10000000-0000-4000-8000-000000000001",
    });
    const { HistoryDataError } = await import("@/lib/data/history");
    loadHistory.mockRejectedValueOnce(new HistoryDataError("Invalid history row."));
    render(await invoke());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "History could not be loaded safely.",
    );
  });
});
