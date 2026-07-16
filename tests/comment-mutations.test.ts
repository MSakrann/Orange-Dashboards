import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CommentMutationError,
  createComment,
  deleteComment,
  updateComment,
  validateCommentInput,
} from "@/lib/data/comment-mutations";
import type { Database } from "@/types/database";

describe("comment mutations", () => {
  it("trims and rejects blank comment fields", () => {
    expect(validateCommentInput({ authorName: " Avery ", body: " Update " })).toEqual({
      authorName: "Avery",
      body: "Update",
    });
    expect(() => validateCommentInput({ authorName: " ", body: "Update" }))
      .toThrow("Author is required");
    expect(() => validateCommentInput({ authorName: "Avery", body: "\n " }))
      .toThrow("Comment is required");
    expect(() => validateCommentInput({ authorName: "x".repeat(201), body: "Update" }))
      .toThrow(/200 characters/i);
    expect(() => validateCommentInput({ authorName: "Avery", body: "x".repeat(10_001) }))
      .toThrow(/10000 characters/i);
  });

  it("creates a typed comment and requires an affected row", async () => {
    const row = {
      id: "comment-a",
      work_item_id: "item-a",
      author_name: "Avery",
      body: "Update",
      created_at: "2026-07-15T10:00:00Z",
      updated_at: "2026-07-15T10:00:00Z",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>;

    await expect(createComment(client, "item-a", {
      authorName: " Avery ",
      body: " Update ",
    }, "comment-a")).resolves.toBe(row);
    expect(insert).toHaveBeenCalledWith({
      id: "comment-a",
      work_item_id: "item-a",
      author_name: "Avery",
      body: "Update",
    });

    single.mockResolvedValueOnce({ data: null, error: null });
    await expect(createComment(client, "item-a", {
      authorName: "Avery",
      body: "Update",
    })).rejects.toBeInstanceOf(CommentMutationError);
  });

  it("uses the loaded timestamp to reject stale edits and scopes deletes to the item", async () => {
    const row = {
      id: "comment-a",
      work_item_id: "item-a",
      updated_at: "2026-07-15T10:01:00Z",
    };
    const updateSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const deleteSingle = vi.fn().mockResolvedValue({ data: { id: "comment-a" }, error: null });
    const update = vi.fn(() => ({
      eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateSingle }) }) }) }),
    }));
    const remove = vi.fn(() => ({
      eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: deleteSingle }) }) }) }),
    }));
    const client = {
      from: vi.fn(() => ({ update, delete: remove })),
    } as unknown as SupabaseClient<Database>;

    await updateComment(client, "item-a", "comment-a", "2026-07-15T10:00:00Z", {
      authorName: "Avery",
      body: "Changed",
    });
    await deleteComment(client, "item-a", "comment-a", "2026-07-15T10:00:00Z");

    updateSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateComment(
      client,
      "item-a",
      "comment-a",
      "2026-07-15T10:00:00Z",
      { authorName: "Avery", body: "Changed" },
    )).rejects.toThrow(/changed by someone else/i);

    deleteSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteComment(
      client,
      "item-a",
      "comment-a",
      "2026-07-15T10:00:00Z",
    )).rejects.toThrow(/changed by someone else/i);
  });
});
