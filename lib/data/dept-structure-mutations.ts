import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export class DeptMutationError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "DeptMutationError";
  }
}

export interface DeptProfileInput {
  brandName: string;
  heroHeadline: string;
  heroSupport: string;
  mission: string;
  departmentHeadName: string;
  departmentHeadTitle: string;
  statTeams: number | null;
  statMembers: number | null;
  statActiveProjects: number | null;
  statOnTrackPct: number | null;
}

export interface DeptTeamInput {
  name: string;
  leadName: string;
  focus: string;
  goal: string;
  scope: string;
  activitySummary: string;
  projectCount: number | null;
  sortOrder: number;
}

export interface DeptMemberInput {
  name: string;
  role: string;
  sortOrder: number;
}

const MAX_TEAMS = 6;

function failure(operation: string, error: { message: string; code?: string } | null): never {
  const message = error?.message ?? "No affected row was returned.";
  if (/Maximum of 6 teams/i.test(message)) {
    throw new DeptMutationError("Maximum of 6 teams allowed.");
  }
  throw new DeptMutationError(`${operation} failed: ${message}`, error?.code === "55P03");
}

function requireText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new DeptMutationError(`${label} is required.`);
  if (trimmed.length > max) {
    throw new DeptMutationError(`${label} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function optionalText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new DeptMutationError(`${label} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function requireInt(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new DeptMutationError(`${label} must be a whole number.`);
  }
  if (value < min || value > max) {
    throw new DeptMutationError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function optionalInt(value: number | null | undefined, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return requireInt(value, label, min, max);
}

export function validateProfileInput(input: DeptProfileInput): DeptProfileInput {
  return {
    brandName: requireText(input.brandName, "Brand name", 120),
    heroHeadline: requireText(input.heroHeadline, "Headline", 200),
    heroSupport: optionalText(input.heroSupport, "Support line", 500),
    mission: optionalText(input.mission, "Mission", 5000),
    departmentHeadName: optionalText(input.departmentHeadName, "Department head", 200),
    departmentHeadTitle: optionalText(input.departmentHeadTitle, "Head title", 200),
    statTeams: optionalInt(input.statTeams, "Functions stat", 0, 99),
    statMembers: optionalInt(input.statMembers, "Members stat", 0, 9999),
    statActiveProjects: optionalInt(input.statActiveProjects, "Active projects stat", 0, 9999),
    statOnTrackPct: optionalInt(input.statOnTrackPct, "On-track %", 0, 100) ?? 0,
  };
}

export function validateTeamInput(input: DeptTeamInput): DeptTeamInput {
  return {
    name: requireText(input.name, "Team name", 200),
    leadName: optionalText(input.leadName, "Lead name", 200),
    focus: optionalText(input.focus, "Focus", 2000),
    goal: optionalText(input.goal, "Goal", 2000),
    scope: optionalText(input.scope, "Scope", 500),
    activitySummary: optionalText(input.activitySummary, "Activity summary", 500),
    projectCount: optionalInt(input.projectCount, "Project count", 0, 9999),
    sortOrder: requireInt(input.sortOrder, "Sort order", 0, 99),
  };
}

export function validateMemberInput(input: DeptMemberInput): DeptMemberInput {
  return {
    name: requireText(input.name, "Member name", 200),
    role: optionalText(input.role, "Role", 200),
    sortOrder: requireInt(input.sortOrder, "Sort order", 0, 99),
  };
}

export async function updateDeptProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
  input: DeptProfileInput,
): Promise<Tables<"dept_profile">> {
  const value = validateProfileInput(input);
  const { data, error } = await supabase
    .from("dept_profile")
    .update({
      brand_name: value.brandName,
      hero_headline: value.heroHeadline,
      hero_support: value.heroSupport,
      mission: value.mission,
      department_head_name: value.departmentHeadName,
      department_head_title: value.departmentHeadTitle,
      stat_teams: value.statTeams,
      stat_members: value.statMembers,
      stat_active_projects: value.statActiveProjects,
      stat_on_track_pct: value.statOnTrackPct,
    })
    .eq("id", profileId)
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Update profile", error);
  return data;
}

function missingProjectCountColumn(error: { message: string } | null) {
  return Boolean(error?.message && /project_count/i.test(error.message));
}

export async function createDeptTeam(
  supabase: SupabaseClient<Database>,
  input: DeptTeamInput,
): Promise<Tables<"dept_teams">> {
  const value = validateTeamInput(input);
  const { count, error: countError } = await supabase
    .from("dept_teams")
    .select("id", { count: "exact", head: true });
  if (countError) failure("Count teams", countError);
  if ((count ?? 0) >= MAX_TEAMS) {
    throw new DeptMutationError("Maximum of 6 teams allowed.");
  }

  const payload = {
    name: value.name,
    lead_name: value.leadName,
    focus: value.focus,
    goal: value.goal,
    scope: value.scope,
    activity_summary: value.activitySummary,
    project_count: value.projectCount,
    sort_order: value.sortOrder,
  };
  let { data, error } = await supabase.from("dept_teams").insert(payload).select("*").maybeSingle();
  if (missingProjectCountColumn(error)) {
    const { project_count: _ignored, ...withoutCount } = payload;
    ({ data, error } = await supabase.from("dept_teams").insert(withoutCount).select("*").maybeSingle());
  }
  if (error || !data) failure("Create team", error);
  return data;
}

export async function updateDeptTeam(
  supabase: SupabaseClient<Database>,
  teamId: string,
  input: DeptTeamInput,
): Promise<Tables<"dept_teams">> {
  const value = validateTeamInput(input);
  const payload = {
    name: value.name,
    lead_name: value.leadName,
    focus: value.focus,
    goal: value.goal,
    scope: value.scope,
    activity_summary: value.activitySummary,
    project_count: value.projectCount,
    sort_order: value.sortOrder,
  };
  let { data, error } = await supabase
    .from("dept_teams")
    .update(payload)
    .eq("id", teamId)
    .select("*")
    .maybeSingle();
  if (missingProjectCountColumn(error)) {
    const { project_count: _ignored, ...withoutCount } = payload;
    ({ data, error } = await supabase
      .from("dept_teams")
      .update(withoutCount)
      .eq("id", teamId)
      .select("*")
      .maybeSingle());
  }
  if (error || !data) failure("Update team", error);
  return data;
}

export async function deleteDeptTeam(
  supabase: SupabaseClient<Database>,
  teamId: string,
): Promise<void> {
  const { error } = await supabase.from("dept_teams").delete().eq("id", teamId);
  if (error) failure("Delete team", error);
}

export async function createDeptMember(
  supabase: SupabaseClient<Database>,
  teamId: string,
  input: DeptMemberInput,
): Promise<Tables<"dept_members">> {
  const value = validateMemberInput(input);
  const { data, error } = await supabase
    .from("dept_members")
    .insert({
      team_id: teamId,
      name: value.name,
      role: value.role,
      sort_order: value.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Create member", error);
  return data;
}

export async function updateDeptMember(
  supabase: SupabaseClient<Database>,
  memberId: string,
  input: DeptMemberInput,
): Promise<Tables<"dept_members">> {
  const value = validateMemberInput(input);
  const { data, error } = await supabase
    .from("dept_members")
    .update({
      name: value.name,
      role: value.role,
      sort_order: value.sortOrder,
    })
    .eq("id", memberId)
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Update member", error);
  return data;
}

export async function deleteDeptMember(
  supabase: SupabaseClient<Database>,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.from("dept_members").delete().eq("id", memberId);
  if (error) failure("Delete member", error);
}
