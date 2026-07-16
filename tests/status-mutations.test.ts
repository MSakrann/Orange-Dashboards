import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createStatus,
  deleteStatus,
  reorderStatuses,
  StatusMutationError,
  updateStatus,
  validateStatusInput,
} from "@/lib/data/status-mutations";
import type { Database } from "@/types/database";

describe("status mutations", () => {
  it("validates trimmed names, hex colors, and reporting categories", () => {
    expect(validateStatusInput({
      name: " Review ",
      color: "#Aa5500",
      reportingCategory: "risk",
    })).toEqual({ name: "Review", color: "#aa5500", reportingCategory: "risk" });
    expect(() => validateStatusInput({
      name: " ",
      color: "#000000",
      reportingCategory: "active",
    })).toThrow("Name is required");
    expect(() => validateStatusInput({
      name: "Review",
      color: "orange",
      reportingCategory: "active",
    })).toThrow("six-digit hex");
    expect(() => validateStatusInput({
      name: "x".repeat(201),
      color: "#000000",
      reportingCategory: "active",
    })).toThrow(/200 characters/i);
  });

  it("creates atomically and scopes timestamp-checked updates to one workspace", async () => {
    const row = { id: "status-a" };
    const updateSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateSingle }) }) }),
      }),
    }));
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const client = {
      from: vi.fn(() => ({ update })),
      rpc,
    } as unknown as SupabaseClient<Database>;
    const value = { name: "Review", color: "#aa5500", reportingCategory: "risk" as const };

    await createStatus(client, "workspace-a", "status-a", value);
    expect(rpc).toHaveBeenCalledWith("create_status", {
      p_color: "#aa5500",
      p_name: "Review",
      p_reporting_category: "risk",
      p_status_id: "status-a",
      p_workspace_id: "workspace-a",
    });
    await updateStatus(
      client,
      "workspace-a",
      "status-a",
      "2026-07-15T10:00:00Z",
      value,
    );
    updateSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateStatus(
      client,
      "workspace-b",
      "status-a",
      "2026-07-15T10:00:00Z",
      value,
    )).rejects.toThrow(/changed by someone else/i);
  });

  it("uses atomic workspace-scoped RPCs for reorder and replacement deletion", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: undefined, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await reorderStatuses(client, "workspace-a", ["status-b", "status-a"]);
    await deleteStatus(
      client,
      "workspace-a",
      "status-a",
      "status-b",
      "2026-07-15T10:00:00Z",
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "reorder_statuses", {
      p_workspace_id: "workspace-a",
      p_ordered_status_ids: ["status-b", "status-a"],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "replace_and_delete_status", {
      p_workspace_id: "workspace-a",
      p_source_status_id: "status-a",
      p_replacement_status_id: "status-b",
      p_expected_updated_at: "2026-07-15T10:00:00Z",
    });
  });

  it("marks stale replacement deletion as a non-retryable conflict", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "40001", message: "status changed" },
      }),
    } as unknown as SupabaseClient<Database>;

    const error = await deleteStatus(
      client,
      "workspace-a",
      "status-a",
      "status-b",
      "2026-07-15T10:00:00Z",
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(StatusMutationError);
    expect(error.conflict).toBe(true);
    expect(error.retryable).toBe(false);
  });
});
