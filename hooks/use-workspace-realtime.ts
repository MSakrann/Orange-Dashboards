"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { loadDashboard, type DashboardViewModel } from "@/lib/data/dashboard";
import {
  WorkspaceRealtimeController,
  type RealtimeChannelStatus,
  type WorkspaceRealtimeDependencies,
  type WorkspaceRealtimeSnapshot,
} from "@/lib/realtime/workspace-controller";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

let channelSequence = 0;

function safeFilterId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Realtime subscriptions require UUID workspace and item identifiers");
  }
  return value;
}

export function createSupabaseRealtimeDependencies(
  supabase: SupabaseClient<Database>,
): WorkspaceRealtimeDependencies {
  return {
    async load(workspaceSlug) {
      const dashboard = await loadDashboard(supabase, workspaceSlug);
      if (!dashboard) throw new Error("Workspace no longer exists");
      return dashboard;
    },
    subscribe({ workspaceId, workItemIds, onEvent, onStatus }) {
      const safeWorkspaceId = safeFilterId(workspaceId);
      const safeItemIds = workItemIds.map(safeFilterId);
      const channels: RealtimeChannel[] = [];
      const statuses = new Map<RealtimeChannel, RealtimeChannelStatus>();
      const channelPrefix = `workspace-dashboard-${workspaceId}-${channelSequence++}`;
      let active = true;
      const handleEvent = () => {
        if (active) onEvent();
      };

      const workspaceChannel = supabase
        .channel(`${channelPrefix}-workspace`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "workspaces", filter: `id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "workspaces" },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "statuses", filter: `workspace_id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "statuses", filter: `workspace_id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "statuses" },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "work_items", filter: `workspace_id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "work_items", filter: `workspace_id=eq.${safeWorkspaceId}` },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "work_items" },
          handleEvent,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "comments" },
          handleEvent,
        );
      channels.push(workspaceChannel);

      const commentIdGroups = Array.from(
        { length: Math.ceil(safeItemIds.length / 100) },
        (_, index) => safeItemIds.slice(index * 100, (index + 1) * 100),
      );
      commentIdGroups.forEach((itemIds, index) => {
        channels.push(
          supabase
            .channel(`${channelPrefix}-comments-${index}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "comments",
                filter: `work_item_id=in.(${itemIds.join(",")})`,
              },
              handleEvent,
            )
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "comments",
                filter: `work_item_id=in.(${itemIds.join(",")})`,
              },
              handleEvent,
            ),
        );
      });

      channels.forEach((channel) => {
        channel.subscribe((status) => {
          if (!active) return;
          const normalized = status as RealtimeChannelStatus;
          statuses.set(channel, normalized);
          if (normalized === "SUBSCRIBED") {
            if (channels.every((candidate) => statuses.get(candidate) === "SUBSCRIBED")) {
              onStatus("SUBSCRIBED");
            }
          } else {
            onStatus(normalized);
          }
        });
      });

      return () => {
        active = false;
        channels.forEach((channel) => {
          void supabase.removeChannel(channel);
        });
      };
    },
  };
}

interface UseWorkspaceRealtimeOptions {
  enabled: boolean;
  dependencies?: WorkspaceRealtimeDependencies;
}

export interface WorkspaceRealtimeResult extends WorkspaceRealtimeSnapshot {
  fixture: boolean;
  refetch: () => Promise<DashboardViewModel>;
}

export function useWorkspaceRealtime(
  initialData: DashboardViewModel,
  options: UseWorkspaceRealtimeOptions,
): WorkspaceRealtimeResult {
  const dependencies = useMemo(() => {
    if (!options.enabled) return null;
    return options.dependencies ?? createSupabaseRealtimeDependencies(createClient());
  }, [options.dependencies, options.enabled]);
  const controller = useMemo(
    () => dependencies ? new WorkspaceRealtimeController(initialData, dependencies) : null,
    [dependencies, initialData],
  );
  const fixtureSnapshot = useMemo<WorkspaceRealtimeSnapshot>(
    () => ({ data: initialData, connection: "live", error: null }),
    [initialData],
  );

  useEffect(() => {
    controller?.start();
    return () => controller?.stop();
  }, [controller]);

  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => fixtureSnapshot),
    () => fixtureSnapshot,
  );
  const refetch = useMemo(
    () => controller?.refetch ?? (async () => initialData),
    [controller, initialData],
  );

  return { ...snapshot, fixture: !options.enabled, refetch };
}
