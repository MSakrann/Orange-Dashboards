import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusManager } from "@/components/admin/statuses/status-manager";
import type { Workspace } from "@/data/workspaces";
import { mapFixtureWorkspace } from "@/lib/data/initial-dashboard";
import { StatusMutationError } from "@/lib/data/status-mutations";

const mutations = vi.hoisted(() => ({
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  reorderStatuses: vi.fn(),
  deleteStatus: vi.fn(),
}));
const refetch = vi.hoisted(() => vi.fn());
const realtimeState = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/data/status-mutations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/data/status-mutations")>(),
  ...mutations,
}));
vi.mock("@/hooks/use-workspace-realtime", () => ({
  useWorkspaceRealtime: (data: unknown) => ({
    data: realtimeState.data ?? data,
    refetch,
    connection: "live",
    error: null,
    fixture: false,
  }),
}));

const fixture: Workspace = {
  slug: "admin",
  name: "Admin",
  description: "",
  projects: [{
    id: "project-a",
    title: "Project",
    description: "",
    status: "in-progress",
    owner: "Avery",
    priority: "medium",
    progress: 20,
    comments: [],
  }],
};
const dashboard = mapFixtureWorkspace(fixture);
dashboard.id = "workspace-a";
dashboard.statuses.forEach((status, index) => {
  status.id = `status-${index}`;
  status.updatedAt = `2026-07-15T10:0${index}:00Z`;
});
dashboard.projects[0].statusId = "status-0";

describe("StatusManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeState.data = undefined;
    refetch.mockResolvedValue(dashboard);
    Object.values(mutations).forEach((mutation) => mutation.mockResolvedValue(undefined));
  });

  it("shows usage counts and rejects duplicate names", async () => {
    const user = userEvent.setup();
    render(<StatusManager initialDashboard={dashboard} />);
    expect(screen.getByText((_, element) => element?.textContent === "active · 1 item"))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New status" }));
    await user.type(screen.getByLabelText("Status name"), " in progress ");
    await user.click(screen.getByRole("button", { name: "Create status" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(mutations.createStatus).not.toHaveBeenCalled();
  });

  it("exposes the status-name database limit", async () => {
    const user = userEvent.setup();
    render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "New status" }));
    expect(screen.getByLabelText("Status name")).toHaveAttribute("maxlength", "200");
  });

  it("reorders through the atomic RPC mutation", async () => {
    const user = userEvent.setup();
    render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "Move At Risk up" }));
    expect(mutations.reorderStatuses).toHaveBeenCalledWith(
      expect.anything(),
      "workspace-a",
      ["status-1", "status-0", "status-2", "status-3"],
    );
  });

  it("requires replacement for used deletion and prevents final status deletion", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "Delete In Progress" }));
    expect(screen.getByLabelText("Replacement status")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Replacement status"), "status-1");
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(mutations.deleteStatus).toHaveBeenCalledWith(
      expect.anything(),
      "workspace-a",
      "status-0",
      "status-1",
      "2026-07-15T10:00:00Z",
    );
  });

  it("uses a stable UUID and refetches before retrying status creation", async () => {
    const user = userEvent.setup();
    mutations.createStatus
      .mockRejectedValueOnce(new Error("outcome unknown"))
      .mockResolvedValueOnce(undefined);
    render(<StatusManager initialDashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "New status" }));
    await user.type(screen.getByLabelText("Status name"), "Review");
    await user.click(screen.getByRole("button", { name: "Create status" }));
    await screen.findByRole("button", { name: "Retry" });
    const firstId = mutations.createStatus.mock.calls[0][2];
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/i);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch.mock.invocationCallOrder[1]).toBeLessThan(
      mutations.createStatus.mock.invocationCallOrder[1],
    );
    expect(mutations.createStatus.mock.calls[1][2]).toBe(firstId);
  });

  it("does not replay a committed update when only refresh fails", async () => {
    const user = userEvent.setup();
    const updated = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0" ? { ...status, name: "Doing" } : status),
    };
    refetch
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce(updated);
    render(<StatusManager initialDashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "Edit In Progress" }));
    await user.clear(screen.getByLabelText("Status name"));
    await user.type(screen.getByLabelText("Status name"), "Doing");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/saved.*could not refresh/i);
    await user.click(screen.getByRole("button", { name: "Retry refresh" }));
    expect(mutations.updateStatus).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("detects an already-applied status create by its stable ID", async () => {
    const user = userEvent.setup();
    let createdId = "";
    mutations.createStatus.mockImplementationOnce(
      (_client, _workspaceId, id: string) => {
        createdId = id;
        return Promise.reject(new Error("response lost"));
      },
    );
    refetch.mockImplementation(async () => ({
      ...dashboard,
      statuses: [...dashboard.statuses, {
        id: createdId,
        name: "Review",
        color: "#e56f18",
        reportingCategory: "active" as const,
        sortOrder: dashboard.statuses.length,
        updatedAt: "2026-07-15T11:00:00Z",
      }],
    }));
    render(<StatusManager initialDashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "New status" }));
    await user.type(screen.getByLabelText("Status name"), "Review");
    await user.click(screen.getByRole("button", { name: "Create status" }));

    expect(await screen.findByText("Review")).toBeInTheDocument();
    expect(mutations.createStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("converges to the newest status snapshot queued while busy", async () => {
    const user = userEvent.setup();
    let rejectCreate!: (error: Error) => void;
    mutations.createStatus.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectCreate = reject;
    }));
    refetch.mockRejectedValue(new Error("offline"));
    const { rerender } = render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "New status" }));
    await user.type(screen.getByLabelText("Status name"), "Pending");
    await user.click(screen.getByRole("button", { name: "Create status" }));

    realtimeState.data = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0" ? { ...status, name: "Newest realtime status" } : status),
    };
    rerender(<StatusManager initialDashboard={dashboard} />);
    rejectCreate(new Error("save failed"));

    expect(await screen.findByText("Newest realtime status")).toBeInTheDocument();
  });

  it("lets a successful status refetch supersede an older queued snapshot", async () => {
    const user = userEvent.setup();
    let rejectCreate!: (error: Error) => void;
    mutations.createStatus.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectCreate = reject;
    }));
    const authoritative = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0" ? { ...status, name: "Authoritative status" } : status),
    };
    refetch.mockResolvedValue(authoritative);
    const { rerender } = render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "New status" }));
    await user.type(screen.getByLabelText("Status name"), "Pending");
    await user.click(screen.getByRole("button", { name: "Create status" }));

    realtimeState.data = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0" ? { ...status, name: "Older queued status" } : status),
    };
    rerender(<StatusManager initialDashboard={dashboard} />);
    rejectCreate(new Error("save failed"));

    expect(await screen.findByText("Authoritative status")).toBeInTheDocument();
    expect(screen.queryByText("Older queued status")).not.toBeInTheDocument();
  });

  it("treats stale status updates as non-retryable and requires re-editing", async () => {
    const user = userEvent.setup();
    const conflict = new StatusMutationError(
      "This status changed by someone else.",
      false,
      true,
    );
    mutations.updateStatus.mockRejectedValueOnce(conflict);
    const refreshed = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0"
          ? { ...status, name: "Changed remotely", updatedAt: "new-version" }
          : status),
    };
    refetch.mockResolvedValue(refreshed);
    render(<StatusManager initialDashboard={dashboard} />);
    await user.click(screen.getByRole("button", { name: "Edit In Progress" }));
    await user.clear(screen.getByLabelText("Status name"));
    await user.type(screen.getByLabelText("Status name"), "My stale edit");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(await screen.findByText("Changed remotely")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/changed.*review.*edit/i);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(mutations.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("requires fresh confirmation after a stale status delete", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mutations.deleteStatus.mockRejectedValueOnce(new StatusMutationError(
      "This status changed by someone else.",
      false,
      true,
    ));
    const refreshed = {
      ...dashboard,
      statuses: dashboard.statuses.map((status) =>
        status.id === "status-0"
          ? { ...status, name: "Changed before delete", updatedAt: "new-version" }
          : status),
    };
    refetch.mockResolvedValue(refreshed);
    render(<StatusManager initialDashboard={dashboard} />);

    await user.click(screen.getByRole("button", { name: "Delete In Progress" }));
    await user.selectOptions(screen.getByLabelText("Replacement status"), "status-1");
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(await screen.findByText("Changed before delete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Replacement status")).not.toBeInTheDocument();
    expect(mutations.deleteStatus).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });
});
