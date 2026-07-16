import { render, screen } from "@testing-library/react";
import {
  buildHistorySearchParams,
  formatHistoryChanges,
  formatHistoryTimestamp,
  historyAccessRedirect,
  HistoryDataError,
  loadHistory,
  loadHistoryActors,
  parseHistoryActorRows,
  parseHistoryRpcRows,
  parseHistoryFilters,
  resolveHistoryWorkspace,
  type HistoryEntry,
} from "@/lib/data/history";
import { HistoryFilters } from "@/components/history/history-filters";
import { HistoryList } from "@/components/history/history-list";
import { HistoryPagination } from "@/components/history/history-pagination";

const entry: HistoryEntry = {
  id: "70000000-0000-4000-8000-000000000001",
  actorId: "90000000-0000-4000-8000-000000000001",
  actorName: "Stored Admin",
  actorDisplayName: "Current Admin",
  actorEmail: "admin@example.com",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workspaceName: "Alpha",
  workspaceSlug: "alpha",
  action: "update",
  entityType: "work_item",
  entityId: "30000000-0000-4000-8000-000000000001",
  oldValues: { title: "Old title", description: null, unchanged: "same" },
  newValues: {
    title: "New title",
    description: "A".repeat(240),
    unchanged: "same",
  },
  createdAt: "2026-07-15T10:00:00Z",
};
const snapshotAt = "2026-07-15T10:30:00.000Z";

describe("history URL validation", () => {
  it("fails closed for missing env, anonymous users, and non-admins", () => {
    const paths = { workspacePath: "/alpha", historyPath: "/alpha/history" };
    expect(historyAccessRedirect({ envConfigured: false, authenticated: false, admin: false }, paths))
      .toBe("/alpha");
    expect(historyAccessRedirect({ envConfigured: true, authenticated: false, admin: false }, paths))
      .toBe("/login?next=%2Falpha%2Fhistory");
    expect(historyAccessRedirect({ envConfigured: true, authenticated: true, admin: false }, paths))
      .toBe("/alpha");
    expect(historyAccessRedirect({ envConfigured: true, authenticated: true, admin: true }, paths))
      .toBeNull();
  });

  it("accepts known filters and safely discards invalid values", () => {
    expect(parseHistoryFilters({
      actor: "90000000-0000-4000-8000-000000000001",
      action: "UPDATE",
      entity: "work_item",
      from: "2026-02-29",
      to: "2026-07-15",
      page: "-7",
      snapshot: "not-a-date",
    })).toEqual({
      actor: "90000000-0000-4000-8000-000000000001",
      action: "",
      entityType: "work_item",
      from: "",
      to: "2026-07-15",
      page: 1,
      snapshotAt: "",
    });
  });

  it("preserves active filters while changing pages", () => {
    const params = buildHistorySearchParams({
      actor: "",
      action: "delete",
      entityType: "comment",
      from: "2026-07-01",
      to: "",
      page: 3,
      snapshotAt,
    });
    expect(params.toString()).toBe(
      `action=delete&entity=comment&from=2026-07-01&page=3&snapshot=${encodeURIComponent(snapshotAt)}`,
    );
  });

  it("rejects reversed and excessive date ranges before querying", () => {
    expect(parseHistoryFilters({ from: "2026-07-15", to: "2026-07-01" }))
      .toMatchObject({ from: "", to: "" });
    expect(parseHistoryFilters({ from: "2024-01-01", to: "2026-01-01" }))
      .toMatchObject({ from: "", to: "" });
  });

  it("falls back to the first page when a filtered page is out of range", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{
          action: "update",
          actor_display_name: null,
          actor_email: null,
          actor_id: null,
          actor_name: null,
          created_at: "2026-07-15T10:00:00Z",
          entity_id: null,
          entity_type: "status",
          id: "70000000-0000-4000-8000-000000000001",
          new_values: null,
          old_values: null,
          snapshot_at: snapshotAt,
          total_count: 1,
          workspace_id: "10000000-0000-4000-8000-000000000001",
          workspace_name: "Alpha",
          workspace_slug: "alpha",
        }],
        error: null,
      });
    const result = await loadHistory(
      { rpc } as never,
      "alpha",
      parseHistoryFilters({ page: "99" }),
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_page: 1 });
    expect(result).toMatchObject({ page: 1, totalCount: 1 });
  });

  it("passes a validated snapshot anchor to every RPC page request", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await loadHistory(
      { rpc } as never,
      "alpha",
      parseHistoryFilters({ snapshot: snapshotAt }),
    );
    expect(rpc).toHaveBeenCalledWith("query_activity_history", expect.objectContaining({
      p_snapshot_at: snapshotAt,
    }));
  });
});

describe("history RPC runtime validation", () => {
  const validRow = {
    action: "update",
    actor_display_name: "Admin",
    actor_email: "admin@example.com",
    actor_id: "90000000-0000-4000-8000-000000000001",
    actor_name: "Snapshot",
    created_at: "2026-07-15T10:00:00Z",
    entity_id: "30000000-0000-4000-8000-000000000001",
    entity_type: "work_item",
    id: "70000000-0000-4000-8000-000000000001",
    new_values: { title: "New" },
    old_values: { title: "Old" },
    snapshot_at: snapshotAt,
    total_count: 1,
    workspace_id: "10000000-0000-4000-8000-000000000001",
    workspace_name: "Alpha",
    workspace_slug: "alpha",
  };

  it("accepts generated-shape rows only after explicit runtime parsing", () => {
    expect(parseHistoryRpcRows([validRow])).toMatchObject({
      totalCount: 1,
      snapshotAt,
      entries: [{ action: "update", entityType: "work_item" }],
    });
  });

  it.each([
    [{ ...validRow, id: "not-a-uuid" }, "UUID"],
    [{ ...validRow, created_at: "not-a-date" }, "timestamp"],
    [{ ...validRow, created_at: "1" }, "timestamp"],
    [{ ...validRow, created_at: "2026-02-29T10:00:00Z" }, "timestamp"],
    [{ ...validRow, actor_email: 42 }, "actor"],
    [{ ...validRow, actor_id: null, actor_email: "leak@example.com" }, "actor"],
    [{ ...validRow, workspace_name: 42 }, "workspace"],
    [{ ...validRow, action: "<script>alert(1)</script>" }, "action"],
    [{ ...validRow, entity_type: "x".repeat(500) }, "entity"],
    [{ ...validRow, old_values: [] }, "JSON"],
    [{ ...validRow, total_count: -1 }, "count"],
    [{ ...validRow, snapshot_at: "bad" }, "snapshot"],
  ])("rejects malformed RPC rows", (row, message) => {
    expect(() => parseHistoryRpcRows([row])).toThrowError(HistoryDataError);
    expect(() => parseHistoryRpcRows([row])).toThrow(new RegExp(message, "i"));
  });

  it("rejects prototype keys nested in JSON values", () => {
    const hostile = JSON.parse('{"title":"safe","nested":{"__proto__":{"polluted":true}}}');
    expect(() => parseHistoryRpcRows([{ ...validRow, old_values: hostile }]))
      .toThrow(/JSON/i);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("marks an oversized legacy JSON string without rejecting its entry", () => {
    const parsed = parseHistoryRpcRows([{
      ...validRow,
      old_values: { description: "x".repeat(25_000) },
    }]);
    const changes = formatHistoryChanges(parsed.entries[0]);
    expect(changes[0].oldValue).toMatch(/oversized value truncated/i);
    expect(changes[0].newValue).toBe("None");
  });

  it("degrades oversized actor metadata per entry with clear markers", () => {
    const parsed = parseHistoryRpcRows([{
      ...validRow,
      actor_name: "s".repeat(250),
      actor_display_name: "d".repeat(250),
      actor_email: "e".repeat(400),
    }]);
    expect(parsed.entries[0]).toMatchObject({
      actorName: expect.stringMatching(/oversized value truncated/i),
      actorDisplayName: expect.stringMatching(/oversized value truncated/i),
      actorEmail: expect.stringMatching(/oversized value truncated/i),
    });
    expect(parsed.entries[0].actorName!.length).toBeLessThanOrEqual(200);
    expect(parsed.entries[0].actorDisplayName!.length).toBeLessThanOrEqual(200);
    expect(parsed.entries[0].actorEmail!.length).toBeLessThanOrEqual(320);
  });

  it("treats blank and whitespace actor metadata as absent per entry", () => {
    const parsed = parseHistoryRpcRows([{
      ...validRow,
      actor_name: "   ",
      actor_display_name: "",
      actor_email: "\t ",
    }]);
    expect(parsed.entries[0]).toMatchObject({
      actorName: null,
      actorDisplayName: null,
      actorEmail: null,
    });
    render(<HistoryList entries={parsed.entries} />);
    expect(screen.getByText(validRow.actor_id)).toBeInTheDocument();
  });

  it("requires a consistent snapshot and count across all rows", () => {
    expect(() => parseHistoryRpcRows([
      validRow,
      { ...validRow, id: "70000000-0000-4000-8000-000000000002", total_count: 2 },
    ])).toThrow(/count/i);
    expect(() => parseHistoryRpcRows([
      validRow,
      {
        ...validRow,
        id: "70000000-0000-4000-8000-000000000002",
        snapshot_at: "2026-07-15T11:00:00Z",
      },
    ])).toThrow(/snapshot/i);
  });

  it("resolves and validates private workspace identities", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        is_deleted: true,
        name: "Dynamic Deleted",
        slug: "dynamic-deleted",
        workspace_id: "81000000-0000-4000-8000-000000000040",
      }],
      error: null,
    });
    await expect(resolveHistoryWorkspace({ rpc } as never, "dynamic-deleted"))
      .resolves.toEqual({
        isDeleted: true,
        name: "Dynamic Deleted",
        slug: "dynamic-deleted",
        workspaceId: "81000000-0000-4000-8000-000000000040",
      });
    rpc.mockResolvedValueOnce({
      data: [{ is_deleted: "yes", name: 42, slug: "../bad", workspace_id: "bad" }],
      error: null,
    });
    await expect(resolveHistoryWorkspace({ rpc } as never, "dynamic-deleted"))
      .rejects.toThrowError(HistoryDataError);
  });

  it("loads and strictly parses retained actor options", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        actor_id: "90000000-0000-4000-8000-000000000001",
        display_name: "History Admin",
        email: "history@example.com",
      }],
      error: null,
    });
    await expect(loadHistoryActors({ rpc } as never, "alpha")).resolves.toEqual([{
      actorId: "90000000-0000-4000-8000-000000000001",
      displayName: "History Admin",
      email: "history@example.com",
    }]);
    expect(rpc).toHaveBeenCalledWith("list_history_actors", {
      p_workspace_slug: "alpha",
    });
    expect(() => parseHistoryActorRows([{
      actor_id: "bad",
      display_name: "<script>",
      email: 42,
    }])).toThrowError(HistoryDataError);
  });

  it("degrades oversized actor options without rejecting the filter UI", () => {
    const [actor] = parseHistoryActorRows([{
      actor_id: "90000000-0000-4000-8000-000000000001",
      display_name: "d".repeat(250),
      email: "e".repeat(400),
    }]);
    expect(actor.displayName).toMatch(/oversized value truncated/i);
    expect(actor.email).toMatch(/oversized value truncated/i);
    render(
      <HistoryFilters
        filters={parseHistoryFilters({ actor: actor.actorId })}
        historyPath="/alpha/history"
        actors={[actor]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Actor" }))
      .toHaveTextContent(/oversized value truncated/i);
  });

  it("falls back from blank actor option metadata to a nonblank identifier", () => {
    const [actor] = parseHistoryActorRows([{
      actor_id: "90000000-0000-4000-8000-000000000001",
      display_name: "   ",
      email: "\t",
    }]);
    expect(actor).toEqual({
      actorId: "90000000-0000-4000-8000-000000000001",
      displayName: "90000000-0000-4000-8000-000000000001",
      email: null,
    });
  });
});

describe("readable history", () => {
  it("formats only changed fields with null and long-text handling", () => {
    const changes = formatHistoryChanges(entry);
    expect(changes.map((change) => change.field)).toEqual(["description", "title"]);
    expect(changes[0].oldValue).toBe("None");
    expect(changes[0].newValue).toMatch(/^A{157}…$/);
    expect(changes[1]).toMatchObject({ oldValue: "Old title", newValue: "New title" });
  });

  it("formats insert and delete diffs without inventing values", () => {
    expect(formatHistoryChanges({
      ...entry,
      action: "insert",
      oldValues: null,
      newValues: { title: "Created" },
    })).toEqual([{ field: "title", oldValue: "None", newValue: "Created" }]);
    expect(formatHistoryChanges({
      ...entry,
      action: "delete",
      oldValues: { title: "Deleted" },
      newValues: null,
    })).toEqual([{ field: "title", oldValue: "Deleted", newValue: "None" }]);
  });

  it("escapes hostile text, truncates field names, and formats dates defensively", () => {
    const hostile = {
      ...entry,
      actorName: "<img src=x onerror=alert(1)>",
      actorDisplayName: null,
      actorEmail: null,
      oldValues: { ["x".repeat(300)]: "<script>old</script>" },
      newValues: { ["x".repeat(300)]: "<script>new</script>" },
    };
    render(<HistoryList entries={[hostile]} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(formatHistoryChanges(hostile)[0].field.length).toBeLessThanOrEqual(80);
    expect(formatHistoryTimestamp("not-a-date")).toBe("Invalid timestamp");
  });

  it("renders attribution, values, and no mutation controls", () => {
    render(<HistoryList entries={[entry]} />);
    expect(screen.getByText(/Current Admin/)).toBeInTheDocument();
    expect(screen.getByText(/admin@example.com/)).toBeInTheDocument();
    expect(screen.getByText("Old title")).toBeInTheDocument();
    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders system attribution and an empty state", () => {
    const systemEntry = { ...entry, actorId: null, actorName: null, actorDisplayName: null, actorEmail: null };
    const { rerender } = render(<HistoryList entries={[systemEntry]} />);
    expect(screen.getByText("System")).toBeInTheDocument();
    rerender(<HistoryList entries={[]} />);
    expect(screen.getByText("No history matches these filters.")).toBeInTheDocument();
  });

  it("paginates while retaining validated filters", () => {
    const filters = parseHistoryFilters({ action: "update", entity: "status", page: "2" });
    render(
      <HistoryPagination
        filters={filters}
        historyPath="/alpha/history"
        result={{
          entries: [entry],
          page: 2,
          pageCount: 3,
          pageSize: 25,
          snapshotAt,
          totalCount: 51,
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Previous" }))
      .toHaveAttribute(
        "href",
        `/alpha/history?action=update&entity=status&snapshot=${encodeURIComponent(snapshotAt)}`,
      );
    expect(screen.getByRole("link", { name: "Next" }))
      .toHaveAttribute(
        "href",
        `/alpha/history?action=update&entity=status&page=3&snapshot=${encodeURIComponent(snapshotAt)}`,
      );
  });

  it("provides labelled filter controls and pagination navigation", () => {
    render(
      <HistoryFilters
        filters={parseHistoryFilters({ actor: entry.actorId ?? "" })}
        historyPath="/alpha/history"
        actors={[{
          actorId: entry.actorId!,
          displayName: "Current Admin",
          email: "admin@example.com",
        }]}
      />,
    );
    const actor = screen.getByRole("combobox", { name: "Actor" });
    expect(actor).toHaveValue(entry.actorId);
    expect(actor).toHaveTextContent("Current Admin");
    expect(actor).toHaveTextContent("admin@example.com");
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Entity type" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("To")).toHaveAttribute("type", "date");
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/alpha/history");
  });
});
