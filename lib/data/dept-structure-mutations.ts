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
  statTeams: number;
  statMembers: number;
  statActiveProjects: number;
  statOnTrackPct: number;
}

export interface DeptTeamInput {
  name: string;
  leadName: string;
  focus: string;
  goal: string;
  scope: string;
  sortOrder: number;
}

export interface DeptMemberInput {
  name: string;
  role: string;
  sortOrder: number;
}

export interface DeptProjectInput {
  teamId: string | null;
  title: string;
  summary: string;
  isHighlighted: boolean;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  progressPct: number;
  statusLabel: string;
  sortOrder: number;
}

export interface DeptMilestoneInput {
  title: string;
  dueDate: string | null;
  isDone: boolean;
  sortOrder: number;
}

export interface DeptTimelineInput {
  label: string;
  startDate: string | null;
  endDate: string | null;
  statusLabel: string;
  sortOrder: number;
}

const MAX_TEAMS = 5;
const MAX_HIGHLIGHTS = 3;

function failure(operation: string, error: { message: string; code?: string } | null): never {
  const message = error?.message ?? "No affected row was returned.";
  if (/Maximum of 5 teams/i.test(message)) {
    throw new DeptMutationError("Maximum of 5 teams allowed.");
  }
  if (/Maximum of 3 highlighted/i.test(message)) {
    throw new DeptMutationError("Maximum of 3 highlighted projects allowed.");
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

function emptyToNullDate(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  return value.trim();
}

export function validateProfileInput(input: DeptProfileInput): DeptProfileInput {
  return {
    brandName: requireText(input.brandName, "Brand name", 120),
    heroHeadline: requireText(input.heroHeadline, "Headline", 200),
    heroSupport: optionalText(input.heroSupport, "Support line", 500),
    mission: optionalText(input.mission, "Mission", 5000),
    departmentHeadName: optionalText(input.departmentHeadName, "Department head", 200),
    departmentHeadTitle: optionalText(input.departmentHeadTitle, "Head title", 200),
    statTeams: requireInt(input.statTeams, "Teams stat", 0, 99),
    statMembers: requireInt(input.statMembers, "Members stat", 0, 9999),
    statActiveProjects: requireInt(input.statActiveProjects, "Active projects stat", 0, 9999),
    statOnTrackPct: requireInt(input.statOnTrackPct, "On-track %", 0, 100),
  };
}

export function validateTeamInput(input: DeptTeamInput): DeptTeamInput {
  return {
    name: requireText(input.name, "Team name", 200),
    leadName: optionalText(input.leadName, "Lead name", 200),
    focus: optionalText(input.focus, "Focus", 2000),
    goal: optionalText(input.goal, "Goal", 2000),
    scope: optionalText(input.scope, "Scope", 500),
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

export function validateProjectInput(input: DeptProjectInput): DeptProjectInput {
  return {
    teamId: input.teamId,
    title: requireText(input.title, "Project title", 200),
    summary: optionalText(input.summary, "Summary", 5000),
    isHighlighted: Boolean(input.isHighlighted),
    ownerName: optionalText(input.ownerName, "Owner", 200),
    startDate: emptyToNullDate(input.startDate),
    endDate: emptyToNullDate(input.endDate),
    progressPct: requireInt(input.progressPct, "Progress", 0, 100),
    statusLabel: optionalText(input.statusLabel, "Status", 120),
    sortOrder: requireInt(input.sortOrder, "Sort order", 0, 99),
  };
}

export function validateMilestoneInput(input: DeptMilestoneInput): DeptMilestoneInput {
  return {
    title: requireText(input.title, "Milestone title", 200),
    dueDate: emptyToNullDate(input.dueDate),
    isDone: Boolean(input.isDone),
    sortOrder: requireInt(input.sortOrder, "Sort order", 0, 99),
  };
}

export function validateTimelineInput(input: DeptTimelineInput): DeptTimelineInput {
  return {
    label: requireText(input.label, "Timeline label", 200),
    startDate: emptyToNullDate(input.startDate),
    endDate: emptyToNullDate(input.endDate),
    statusLabel: optionalText(input.statusLabel, "Status", 120),
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
    throw new DeptMutationError("Maximum of 5 teams allowed.");
  }

  const { data, error } = await supabase
    .from("dept_teams")
    .insert({
      name: value.name,
      lead_name: value.leadName,
      focus: value.focus,
      goal: value.goal,
      scope: value.scope,
      sort_order: value.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Create team", error);
  return data;
}

export async function updateDeptTeam(
  supabase: SupabaseClient<Database>,
  teamId: string,
  input: DeptTeamInput,
): Promise<Tables<"dept_teams">> {
  const value = validateTeamInput(input);
  const { data, error } = await supabase
    .from("dept_teams")
    .update({
      name: value.name,
      lead_name: value.leadName,
      focus: value.focus,
      goal: value.goal,
      scope: value.scope,
      sort_order: value.sortOrder,
    })
    .eq("id", teamId)
    .select("*")
    .maybeSingle();
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

export async function createDeptProject(
  supabase: SupabaseClient<Database>,
  input: DeptProjectInput,
): Promise<Tables<"dept_projects">> {
  const value = validateProjectInput(input);
  if (value.isHighlighted) {
    const { count, error: countError } = await supabase
      .from("dept_projects")
      .select("id", { count: "exact", head: true })
      .eq("is_highlighted", true);
    if (countError) failure("Count highlights", countError);
    if ((count ?? 0) >= MAX_HIGHLIGHTS) {
      throw new DeptMutationError("Maximum of 3 highlighted projects allowed.");
    }
  }

  const { data, error } = await supabase
    .from("dept_projects")
    .insert({
      team_id: value.teamId,
      title: value.title,
      summary: value.summary,
      is_highlighted: value.isHighlighted,
      owner_name: value.ownerName,
      start_date: value.startDate,
      end_date: value.endDate,
      progress_pct: value.progressPct,
      status_label: value.statusLabel,
      sort_order: value.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Create project", error);
  return data;
}

export async function updateDeptProject(
  supabase: SupabaseClient<Database>,
  projectId: string,
  input: DeptProjectInput,
): Promise<Tables<"dept_projects">> {
  const value = validateProjectInput(input);
  if (value.isHighlighted) {
    const { count, error: countError } = await supabase
      .from("dept_projects")
      .select("id", { count: "exact", head: true })
      .eq("is_highlighted", true)
      .neq("id", projectId);
    if (countError) failure("Count highlights", countError);
    if ((count ?? 0) >= MAX_HIGHLIGHTS) {
      throw new DeptMutationError("Maximum of 3 highlighted projects allowed.");
    }
  }

  const { data, error } = await supabase
    .from("dept_projects")
    .update({
      team_id: value.teamId,
      title: value.title,
      summary: value.summary,
      is_highlighted: value.isHighlighted,
      owner_name: value.ownerName,
      start_date: value.startDate,
      end_date: value.endDate,
      progress_pct: value.progressPct,
      status_label: value.statusLabel,
      sort_order: value.sortOrder,
    })
    .eq("id", projectId)
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Update project", error);
  return data;
}

export async function deleteDeptProject(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<void> {
  const { error } = await supabase.from("dept_projects").delete().eq("id", projectId);
  if (error) failure("Delete project", error);
}

export async function createDeptMilestone(
  supabase: SupabaseClient<Database>,
  projectId: string,
  input: DeptMilestoneInput,
): Promise<Tables<"dept_milestones">> {
  const value = validateMilestoneInput(input);
  const { data, error } = await supabase
    .from("dept_milestones")
    .insert({
      project_id: projectId,
      title: value.title,
      due_date: value.dueDate,
      is_done: value.isDone,
      sort_order: value.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Create milestone", error);
  return data;
}

export async function updateDeptMilestone(
  supabase: SupabaseClient<Database>,
  milestoneId: string,
  input: DeptMilestoneInput,
): Promise<Tables<"dept_milestones">> {
  const value = validateMilestoneInput(input);
  const { data, error } = await supabase
    .from("dept_milestones")
    .update({
      title: value.title,
      due_date: value.dueDate,
      is_done: value.isDone,
      sort_order: value.sortOrder,
    })
    .eq("id", milestoneId)
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Update milestone", error);
  return data;
}

export async function deleteDeptMilestone(
  supabase: SupabaseClient<Database>,
  milestoneId: string,
): Promise<void> {
  const { error } = await supabase.from("dept_milestones").delete().eq("id", milestoneId);
  if (error) failure("Delete milestone", error);
}

export async function createDeptTimelineItem(
  supabase: SupabaseClient<Database>,
  input: DeptTimelineInput,
): Promise<Tables<"dept_timeline_items">> {
  const value = validateTimelineInput(input);
  const { data, error } = await supabase
    .from("dept_timeline_items")
    .insert({
      label: value.label,
      start_date: value.startDate,
      end_date: value.endDate,
      status_label: value.statusLabel,
      sort_order: value.sortOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Create timeline item", error);
  return data;
}

export async function updateDeptTimelineItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
  input: DeptTimelineInput,
): Promise<Tables<"dept_timeline_items">> {
  const value = validateTimelineInput(input);
  const { data, error } = await supabase
    .from("dept_timeline_items")
    .update({
      label: value.label,
      start_date: value.startDate,
      end_date: value.endDate,
      status_label: value.statusLabel,
      sort_order: value.sortOrder,
    })
    .eq("id", itemId)
    .select("*")
    .maybeSingle();
  if (error || !data) failure("Update timeline item", error);
  return data;
}

export async function deleteDeptTimelineItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<void> {
  const { error } = await supabase.from("dept_timeline_items").delete().eq("id", itemId);
  if (error) failure("Delete timeline item", error);
}
