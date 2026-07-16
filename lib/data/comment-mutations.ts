import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export interface CommentInput {
  authorName: string;
  body: string;
}

export class CommentMutationError extends Error {
  constructor(message: string, public readonly stale = false) {
    super(message);
    this.name = "CommentMutationError";
  }
}

export function validateCommentInput(input: CommentInput): CommentInput {
  const authorName = input.authorName.trim();
  const body = input.body.trim();
  if (!authorName) throw new CommentMutationError("Author is required.");
  if (!body) throw new CommentMutationError("Comment is required.");
  if (authorName.length > 200) {
    throw new CommentMutationError("Author must be 200 characters or fewer.");
  }
  if (body.length > 10_000) {
    throw new CommentMutationError("Comment must be 10000 characters or fewer.");
  }
  return { authorName, body };
}

function failure(operation: string, error: { message: string } | null): never {
  throw new CommentMutationError(
    `${operation} failed: ${error?.message ?? "No affected row was returned."}`,
  );
}

export async function createComment(
  supabase: SupabaseClient<Database>,
  workItemId: string,
  input: CommentInput,
  id?: string,
): Promise<Tables<"comments">> {
  const value = validateCommentInput(input);
  const { data, error } = await supabase
    .from("comments")
    .insert({
      ...(id ? { id } : {}),
      work_item_id: workItemId,
      author_name: value.authorName,
      body: value.body,
    })
    .select("*")
    .single();
  if (error || !data) failure("Create comment", error);
  return data;
}

export async function updateComment(
  supabase: SupabaseClient<Database>,
  workItemId: string,
  commentId: string,
  expectedUpdatedAt: string,
  input: CommentInput,
): Promise<Tables<"comments">> {
  const value = validateCommentInput(input);
  const { data, error } = await supabase
    .from("comments")
    .update({ author_name: value.authorName, body: value.body })
    .eq("id", commentId)
    .eq("work_item_id", workItemId)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) failure("Update comment", error);
  if (!data) {
    throw new CommentMutationError(
      "This comment changed by someone else. Refresh and try again.",
      true,
    );
  }
  return data;
}

export async function deleteComment(
  supabase: SupabaseClient<Database>,
  workItemId: string,
  commentId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("work_item_id", workItemId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) failure("Delete comment", error);
  if (!data) {
    throw new CommentMutationError(
      "This comment changed by someone else. Refresh and try again.",
      true,
    );
  }
}
