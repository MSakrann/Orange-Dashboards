import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseRealtimeDependencies } from "@/hooks/use-workspace-realtime";
import type { Database } from "@/types/database";

interface Binding {
  spec: {
    event: string;
    schema: string;
    table: string;
    filter?: string;
  };
  callback: () => void;
}

class FakeChannel {
  bindings: Binding[] = [];
  statusCallback?: (status: string) => void;

  on(_type: string, spec: Binding["spec"], callback: () => void) {
    this.bindings.push({ spec, callback });
    return this;
  }

  subscribe(callback: (status: string) => void) {
    this.statusCallback = callback;
    return this;
  }
}

class FakeSupabase {
  channels: FakeChannel[] = [];
  removeChannel = vi.fn().mockResolvedValue("ok");

  channel() {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

function createAdapter(fake: FakeSupabase) {
  return createSupabaseRealtimeDependencies(
    fake as unknown as SupabaseClient<Database>,
  );
}

describe("Supabase workspace realtime adapter", () => {
  it("uses filtered inserts/updates and unfiltered deletes for every table", () => {
    const fake = new FakeSupabase();
    createAdapter(fake).subscribe({
      workspaceId,
      workItemIds: [itemId],
      onEvent: vi.fn(),
      onStatus: vi.fn(),
    });

    const specs = fake.channels.flatMap((channel) => channel.bindings.map(({ spec }) => spec));
    for (const table of ["workspaces", "statuses", "work_items", "comments"]) {
      expect(specs).toContainEqual(expect.objectContaining({ event: "DELETE", table }));
      expect(
        specs.find((spec) => spec.event === "DELETE" && spec.table === table),
      ).not.toHaveProperty("filter");
      expect(specs).toContainEqual(expect.objectContaining({ event: "INSERT", table }));
      expect(specs).toContainEqual(expect.objectContaining({ event: "UPDATE", table }));
    }

    expect(specs).toContainEqual(expect.objectContaining({
      event: "INSERT",
      table: "workspaces",
      filter: `id=eq.${workspaceId}`,
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      event: "UPDATE",
      table: "statuses",
      filter: `workspace_id=eq.${workspaceId}`,
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      event: "INSERT",
      table: "work_items",
      filter: `workspace_id=eq.${workspaceId}`,
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      event: "UPDATE",
      table: "comments",
      filter: `work_item_id=in.(${itemId})`,
    }));
  });

  it("removes every channel and ignores event/status callbacks after cleanup", () => {
    const fake = new FakeSupabase();
    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const cleanup = createAdapter(fake).subscribe({
      workspaceId,
      workItemIds: [itemId],
      onEvent,
      onStatus,
    });
    const retiredChannels = [...fake.channels];

    cleanup();
    retiredChannels.forEach((channel) => {
      channel.bindings.forEach((binding) => binding.callback());
      channel.statusCallback?.("CLOSED");
    });

    expect(fake.removeChannel).toHaveBeenCalledTimes(retiredChannels.length);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("ignores late CLOSED from a retired set after its replacement subscribes", () => {
    const fake = new FakeSupabase();
    const adapter = createAdapter(fake);
    const retiredStatus = vi.fn();
    const cleanupRetired = adapter.subscribe({
      workspaceId,
      workItemIds: [itemId],
      onEvent: vi.fn(),
      onStatus: retiredStatus,
    });
    const retiredChannels = [...fake.channels];
    cleanupRetired();

    const replacementStatus = vi.fn();
    adapter.subscribe({
      workspaceId,
      workItemIds: [itemId],
      onEvent: vi.fn(),
      onStatus: replacementStatus,
    });
    const replacementChannels = fake.channels.slice(retiredChannels.length);
    replacementChannels.forEach((channel) => channel.statusCallback?.("SUBSCRIBED"));
    retiredChannels.forEach((channel) => channel.statusCallback?.("CLOSED"));

    expect(replacementStatus).toHaveBeenCalledWith("SUBSCRIBED");
    expect(retiredStatus).not.toHaveBeenCalled();
  });

  it("routes an unfiltered workspace delete to authoritative refetch", () => {
    const fake = new FakeSupabase();
    const onEvent = vi.fn();
    createAdapter(fake).subscribe({
      workspaceId,
      workItemIds: [],
      onEvent,
      onStatus: vi.fn(),
    });
    const workspaceDelete = fake.channels
      .flatMap((channel) => channel.bindings)
      .find(({ spec }) => spec.table === "workspaces" && spec.event === "DELETE");

    workspaceDelete?.callback();

    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
