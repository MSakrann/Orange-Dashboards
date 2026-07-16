import { describe, expect, it, vi } from "vitest";
import {
  WorkspaceRealtimeController,
  type RealtimeSubscription,
  type WorkspaceRealtimeDependencies,
} from "@/lib/realtime/workspace-controller";
import type { DashboardViewModel } from "@/lib/data/dashboard";

function dashboard(title: string, itemIds = ["item-1"]): DashboardViewModel {
  return {
    id: "workspace-1",
    slug: "alpha",
    name: "Alpha",
    description: "",
    statuses: [{
      id: "status-1",
      name: "In delivery",
      color: "#237b4b",
      sortOrder: 0,
      reportingCategory: "active",
      updatedAt: "",
    }],
    statusGroups: {
      active: ["status-1"],
      risk: [],
      delayed: [],
      completed: [],
    },
    projects: itemIds.map((id, sortOrder) => ({
      id,
      title,
      description: "",
      status: "in-progress",
      statusId: "status-1",
      statusName: "In delivery",
      statusColor: "#237b4b",
      reportingCategory: "active",
      owner: "Unassigned",
      priority: "medium",
      progress: 50,
      sortOrder,
      updatedAt: "",
      comments: [],
      subtasks: [],
    })),
    kpis: {
      total: itemIds.length,
      active: itemIds.length,
      needsAttention: 0,
      completed: 0,
      averageProgress: itemIds.length ? 50 : 0,
    },
  };
}

class FakeRealtime {
  subscriptions = new Set<RealtimeSubscription>();
  cleanups = 0;

  subscribe = vi.fn((subscription: RealtimeSubscription) => {
    this.subscriptions.add(subscription);
    return () => {
      this.cleanups += 1;
      this.subscriptions.delete(subscription);
    };
  });

  event() {
    this.subscriptions.forEach((subscription) => subscription.onEvent());
  }

  status(status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") {
    this.subscriptions.forEach((subscription) => subscription.onStatus(status));
  }
}

function dependencies(
  realtime: FakeRealtime,
  load: WorkspaceRealtimeDependencies["load"],
): WorkspaceRealtimeDependencies {
  return {
    load,
    subscribe: realtime.subscribe,
    debounceMs: 20,
  };
}

describe("WorkspaceRealtimeController", () => {
  it("updates two independent clients after the same realtime event", async () => {
    vi.useFakeTimers();
    const realtime = new FakeRealtime();
    const initial = dashboard("Initial");
    const next = dashboard("Updated");
    const first = new WorkspaceRealtimeController(initial, dependencies(realtime, vi.fn().mockResolvedValue(next)));
    const second = new WorkspaceRealtimeController(initial, dependencies(realtime, vi.fn().mockResolvedValue(next)));

    first.start();
    second.start();
    realtime.event();
    await vi.advanceTimersByTimeAsync(20);

    expect(first.getSnapshot().data.projects[0].title).toBe("Updated");
    expect(second.getSnapshot().data.projects[0].title).toBe("Updated");
    first.stop();
    second.stop();
    vi.useRealTimers();
  });

  it("refetches once after reconnect and ignores duplicate subscribed statuses", async () => {
    const realtime = new FakeRealtime();
    const load = vi.fn().mockResolvedValue(dashboard("Fresh"));
    const controller = new WorkspaceRealtimeController(dashboard("Initial"), dependencies(realtime, load));
    controller.start();

    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    realtime.status("SUBSCRIBED");
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    realtime.status("CHANNEL_ERROR");
    expect(controller.getSnapshot().connection).toBe("disconnected");
    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(controller.getSnapshot().connection).toBe("live");
    controller.stop();
  });

  it("coalesces rapid events and schedules one follow-up for an event during a request", async () => {
    vi.useFakeTimers();
    const realtime = new FakeRealtime();
    let resolveFirst!: (value: DashboardViewModel) => void;
    const firstRequest = new Promise<DashboardViewModel>((resolve) => {
      resolveFirst = resolve;
    });
    const load = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(dashboard("Newest"));
    const controller = new WorkspaceRealtimeController(dashboard("Initial"), dependencies(realtime, load));
    controller.start();

    realtime.event();
    realtime.event();
    realtime.event();
    await vi.advanceTimersByTimeAsync(20);
    expect(load).toHaveBeenCalledTimes(1);

    realtime.event();
    await vi.advanceTimersByTimeAsync(20);
    resolveFirst(dashboard("Older"));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(controller.getSnapshot().data.projects[0].title).toBe("Newest"));
    controller.stop();
    vi.useRealTimers();
  });

  it("makes an explicit refetch wait for a queued authoritative request", async () => {
    const realtime = new FakeRealtime();
    let resolveFirst!: (value: DashboardViewModel) => void;
    const firstRequest = new Promise<DashboardViewModel>((resolve) => {
      resolveFirst = resolve;
    });
    const load = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(dashboard("Forced newest"));
    const controller = new WorkspaceRealtimeController(
      dashboard("Initial"),
      dependencies(realtime, load),
    );
    controller.start();
    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    const forced = controller.refetch();
    resolveFirst(dashboard("Older in-flight"));

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await expect(forced).resolves.toMatchObject({
      projects: [{ title: "Forced newest" }],
    });
    controller.stop();
  });

  it("rejects an explicit refetch when the authoritative load fails", async () => {
    const realtime = new FakeRealtime();
    const controller = new WorkspaceRealtimeController(
      dashboard("Initial"),
      dependencies(realtime, vi.fn().mockRejectedValue(new Error("refresh failed"))),
    );
    controller.start();

    await expect(controller.refetch()).rejects.toThrow("refresh failed");
    expect(controller.getSnapshot().data.projects[0].title).toBe("Initial");
    controller.stop();
  });

  it("cleans up and suppresses a stale request after unmount", async () => {
    const realtime = new FakeRealtime();
    let resolveLoad!: (value: DashboardViewModel) => void;
    const load = vi.fn(() => new Promise<DashboardViewModel>((resolve) => {
      resolveLoad = resolve;
    }));
    const controller = new WorkspaceRealtimeController(dashboard("Initial"), dependencies(realtime, load));
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.start();
    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    listener.mockClear();

    controller.stop();
    resolveLoad(dashboard("Stale"));
    await Promise.resolve();

    expect(realtime.cleanups).toBe(1);
    expect(controller.getSnapshot().data.projects[0].title).toBe("Initial");
    expect(listener).not.toHaveBeenCalled();
  });

  it("rebuilds scoped comment subscriptions when authoritative item ids change", async () => {
    const realtime = new FakeRealtime();
    const controller = new WorkspaceRealtimeController(
      dashboard("Initial"),
      dependencies(realtime, vi.fn().mockResolvedValue(dashboard("Fresh", ["item-1", "item-2"]))),
    );
    controller.start();

    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(realtime.subscribe).toHaveBeenCalledTimes(2));

    expect(realtime.subscribe.mock.calls[1][0].workItemIds).toEqual(["item-1", "item-2"]);
    expect(realtime.cleanups).toBe(1);
    controller.stop();
  });

  it("refreshes after a stop/start cycle while an older request is still pending", async () => {
    let resolveOld!: (value: DashboardViewModel) => void;
    const oldRequest = new Promise<DashboardViewModel>((resolve) => {
      resolveOld = resolve;
    });
    const realtime = new FakeRealtime();
    const load = vi.fn()
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue(dashboard("Current route"));
    const controller = new WorkspaceRealtimeController(
      dashboard("Initial"),
      dependencies(realtime, load),
    );

    controller.start();
    realtime.status("SUBSCRIBED");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    controller.stop();
    controller.start();
    realtime.status("SUBSCRIBED");
    resolveOld(dashboard("Old route"));

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      expect(controller.getSnapshot().data.projects[0].title).toBe("Current route");
    });
    controller.stop();
  });

  it("preserves the last workspace and exposes an error after workspace deletion", async () => {
    vi.useFakeTimers();
    const realtime = new FakeRealtime();
    const controller = new WorkspaceRealtimeController(
      dashboard("Last known workspace"),
      dependencies(
        realtime,
        vi.fn().mockRejectedValue(new Error("Workspace no longer exists")),
      ),
    );
    controller.start();

    realtime.event();
    await vi.advanceTimersByTimeAsync(20);

    expect(controller.getSnapshot()).toMatchObject({
      connection: "error",
      error: "Workspace no longer exists",
    });
    expect(controller.getSnapshot().data.projects[0].title).toBe("Last known workspace");
    controller.stop();
    vi.useRealTimers();
  });
});
