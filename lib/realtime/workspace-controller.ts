import type { DashboardViewModel } from "@/lib/data/dashboard";

export type RealtimeConnection =
  | "connecting"
  | "live"
  | "disconnected"
  | "reconnecting"
  | "error";

export type RealtimeChannelStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED";

export interface RealtimeSubscription {
  workspaceId: string;
  workItemIds: string[];
  onEvent: () => void;
  onStatus: (status: RealtimeChannelStatus) => void;
}

export interface WorkspaceRealtimeDependencies {
  load: (workspaceSlug: string) => Promise<DashboardViewModel>;
  subscribe: (subscription: RealtimeSubscription) => () => void;
  debounceMs?: number;
}

export interface WorkspaceRealtimeSnapshot {
  data: DashboardViewModel;
  connection: RealtimeConnection;
  error: string | null;
}

function projectIds(data: DashboardViewModel) {
  return data.projects.flatMap((project) => [
    project.id,
    ...project.subtasks.map((subtask) => subtask.id),
  ]);
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export class WorkspaceRealtimeController {
  private snapshot: WorkspaceRealtimeSnapshot;
  private readonly listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private refreshInFlight = false;
  private refreshCompletion: Promise<void> | null = null;
  private refreshQueued = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeRealtime: (() => void) | null = null;
  private subscribed = false;
  private lostConnection = false;
  private subscribedItemIds: string[] = [];

  constructor(
    initialData: DashboardViewModel,
    private readonly dependencies: WorkspaceRealtimeDependencies,
  ) {
    this.snapshot = {
      data: initialData,
      connection: "connecting",
      error: null,
    };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  refetch = async () => {
    await this.refresh();
    if (this.snapshot.error) throw new Error(this.snapshot.error);
    return this.snapshot.data;
  };

  start() {
    if (this.active) return;
    this.active = true;
    this.generation += 1;
    this.installSubscription(projectIds(this.snapshot.data));
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.refreshQueued = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    this.subscribed = false;
  }

  private emit() {
    if (!this.active) return;
    this.listeners.forEach((listener) => listener());
  }

  private update(patch: Partial<WorkspaceRealtimeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private installSubscription(itemIds: string[]) {
    const normalizedIds = [...new Set(itemIds)].sort();
    if (this.unsubscribeRealtime && sameIds(normalizedIds, this.subscribedItemIds)) return false;

    this.unsubscribeRealtime?.();
    this.subscribed = false;
    this.subscribedItemIds = normalizedIds;
    this.unsubscribeRealtime = this.dependencies.subscribe({
      workspaceId: this.snapshot.data.id,
      workItemIds: normalizedIds,
      onEvent: this.handleEvent,
      onStatus: this.handleStatus,
    });
    return true;
  }

  private handleEvent = () => {
    if (!this.active) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.refresh();
    }, this.dependencies.debounceMs ?? 75);
  };

  private handleStatus = (status: RealtimeChannelStatus) => {
    if (!this.active) return;

    if (status === "SUBSCRIBED") {
      if (this.subscribed) return;
      this.subscribed = true;
      this.update({
        connection: this.lostConnection ? "reconnecting" : "connecting",
        error: null,
      });
      void this.refresh();
      return;
    }

    this.subscribed = false;
    this.lostConnection = true;
    this.update({ connection: "disconnected" });
  };

  private async refresh() {
    if (!this.active) return;
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      await this.refreshCompletion;
      return;
    }

    this.refreshInFlight = true;
    this.refreshCompletion = this.runRefresh();
    await this.refreshCompletion;
  }

  private async runRefresh() {
    const requestGeneration = this.generation;

    try {
      const data = await this.dependencies.load(this.snapshot.data.slug);
      if (!this.active || requestGeneration !== this.generation) return;

      this.snapshot = {
        data,
        connection: this.subscribed ? "live" : this.snapshot.connection,
        error: null,
      };
      const subscriptionChanged = this.installSubscription(projectIds(data));
      if (subscriptionChanged) {
        this.snapshot = { ...this.snapshot, connection: "connecting" };
      }
      this.emit();
      this.lostConnection = false;
    } catch (error) {
      if (!this.active || requestGeneration !== this.generation) return;
      this.update({
        connection: "error",
        error: error instanceof Error ? error.message : "Unable to refresh workspace",
      });
    } finally {
      this.refreshInFlight = false;
      this.refreshCompletion = null;
      if (this.active && this.refreshQueued) {
        this.refreshQueued = false;
        await this.refresh();
      }
    }
  }
}
