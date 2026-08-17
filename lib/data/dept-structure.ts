import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fixtureDeptStructure,
  type DeptMember,
  type DeptMilestone,
  type DeptProfile,
  type DeptProject,
  type DeptStructure,
  type DeptTeam,
  type DeptTimelineItem,
} from "@/data/dept-structure";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database, Tables } from "@/types/database";

export type { DeptStructure, DeptProfile, DeptTeam, DeptProject, DeptTimelineItem };

function mapProfile(row: Tables<"dept_profile">): DeptProfile {
  return {
    id: row.id,
    brandName: row.brand_name,
    heroHeadline: row.hero_headline,
    heroSupport: row.hero_support,
    mission: row.mission,
    departmentHeadName: row.department_head_name,
    departmentHeadTitle: row.department_head_title,
    statTeams: row.stat_teams,
    statMembers: row.stat_members,
    statActiveProjects: row.stat_active_projects,
    statOnTrackPct: row.stat_on_track_pct,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: Tables<"dept_members">): DeptMember {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    role: row.role,
    sortOrder: row.sort_order,
  };
}

function mapMilestone(row: Tables<"dept_milestones">): DeptMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    dueDate: row.due_date,
    isDone: row.is_done,
    sortOrder: row.sort_order,
  };
}

function mapTimeline(row: Tables<"dept_timeline_items">): DeptTimelineItem {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    statusLabel: row.status_label,
    sortOrder: row.sort_order,
  };
}

export async function loadDeptStructure(
  client: SupabaseClient<Database> | null,
): Promise<DeptStructure> {
  if (!client || !hasSupabasePublicEnv()) {
    return structuredClone(fixtureDeptStructure);
  }

  const [
    profileResult,
    teamsResult,
    membersResult,
    projectsResult,
    milestonesResult,
    timelineResult,
  ] = await Promise.all([
    client.from("dept_profile").select("*").limit(1).maybeSingle(),
    client.from("dept_teams").select("*").order("sort_order").order("name"),
    client.from("dept_members").select("*").order("sort_order").order("name"),
    client.from("dept_projects").select("*").order("sort_order").order("title"),
    client.from("dept_milestones").select("*").order("sort_order").order("title"),
    client.from("dept_timeline_items").select("*").order("sort_order").order("label"),
  ]);

  if (
    profileResult.error ||
    teamsResult.error ||
    membersResult.error ||
    projectsResult.error ||
    milestonesResult.error ||
    timelineResult.error
  ) {
    return structuredClone(fixtureDeptStructure);
  }

  if (!profileResult.data) {
    return structuredClone(fixtureDeptStructure);
  }

  const membersByTeam = new Map<string, DeptMember[]>();
  for (const row of membersResult.data ?? []) {
    const member = mapMember(row);
    const list = membersByTeam.get(member.teamId) ?? [];
    list.push(member);
    membersByTeam.set(member.teamId, list);
  }

  const milestonesByProject = new Map<string, DeptMilestone[]>();
  for (const row of milestonesResult.data ?? []) {
    const milestone = mapMilestone(row);
    const list = milestonesByProject.get(milestone.projectId) ?? [];
    list.push(milestone);
    milestonesByProject.set(milestone.projectId, list);
  }

  const teams: DeptTeam[] = (teamsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    leadName: row.lead_name,
    focus: row.focus,
    goal: row.goal,
    scope: row.scope,
    sortOrder: row.sort_order,
    members: membersByTeam.get(row.id) ?? [],
  }));

  const projects: DeptProject[] = (projectsResult.data ?? []).map((row) => ({
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    summary: row.summary,
    isHighlighted: row.is_highlighted,
    ownerName: row.owner_name,
    startDate: row.start_date,
    endDate: row.end_date,
    progressPct: row.progress_pct,
    statusLabel: row.status_label,
    sortOrder: row.sort_order,
    milestones: milestonesByProject.get(row.id) ?? [],
  }));

  return {
    profile: mapProfile(profileResult.data),
    teams,
    projects,
    timeline: (timelineResult.data ?? []).map(mapTimeline),
  };
}
