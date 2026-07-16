import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { ReportingCategory } from "./dashboard";

export interface StatusInput {
  name: string;
  color: string;
  reportingCategory: ReportingCategory;
}

export class StatusMutationError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly conflict = false,
  ) {
    super(message);
    this.name = "StatusMutationError";
  }
}

const categories: ReportingCategory[] = ["active", "risk", "delayed", "completed"];

export function validateStatusInput(input: StatusInput): StatusInput {
  const name = input.name.trim();
  const color = input.color.trim().toLowerCase();
  if (!name) throw new StatusMutationError("Name is required.");
  if (name.length > 200) {
    throw new StatusMutationError("Name must be 200 characters or fewer.");
  }
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new StatusMutationError("Color must be a six-digit hex value.");
  }
  if (!categories.includes(input.reportingCategory)) {
    throw new StatusMutationError("Select a valid reporting category.");
  }
  return { name, color, reportingCategory: input.reportingCategory };
}

function failure(operation: string, error: { message: string; code?: string } | null): never {
  const duplicate = error?.code === "23505";
  throw new StatusMutationError(
    duplicate
      ? "A status with this name already exists in the workspace."
      : `${operation} failed: ${error?.message ?? "No affected row was returned."}`,
    error?.code === "55P03",
    error?.code === "40001",
  );
}

export async function createStatus(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  statusId: string,
  input: StatusInput,
): Promise<Tables<"statuses">> {
  const value = validateStatusInput(input);
  const { data, error } = await supabase.rpc("create_status", {
    p_workspace_id: workspaceId,
    p_status_id: statusId,
    p_name: value.name,
    p_color: value.color,
    p_reporting_category: value.reportingCategory,
  });
  if (error || !data) failure("Create status", error);
  return data;
}

export async function updateStatus(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  statusId: string,
  expectedUpdatedAt: string,
  input: StatusInput,
): Promise<Tables<"statuses">> {
  const value = validateStatusInput(input);
  const { data, error } = await supabase
    .from("statuses")
    .update({
      name: value.name,
      color: value.color,
      reporting_category: value.reportingCategory,
    })
    .eq("id", statusId)
    .eq("workspace_id", workspaceId)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) failure("Update status", error);
  if (!data) {
    throw new StatusMutationError(
      "This status changed by someone else. Refresh and try again.",
      false,
      true,
    );
  }
  return data;
}

export async function reorderStatuses(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  orderedStatusIds: string[],
): Promise<void> {
  if (!orderedStatusIds.length || new Set(orderedStatusIds).size !== orderedStatusIds.length) {
    throw new StatusMutationError("Reorder requires every status exactly once.");
  }
  const { error } = await supabase.rpc("reorder_statuses", {
    p_workspace_id: workspaceId,
    p_ordered_status_ids: orderedStatusIds,
  });
  if (error) failure("Reorder statuses", error);
}

export async function deleteStatus(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  sourceStatusId: string,
  replacementStatusId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  if (sourceStatusId === replacementStatusId) {
    throw new StatusMutationError("Select a different replacement status.");
  }
  const { error } = await supabase.rpc("replace_and_delete_status", {
    p_workspace_id: workspaceId,
    p_source_status_id: sourceStatusId,
    p_replacement_status_id: replacementStatusId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) failure("Delete status", error);
}
