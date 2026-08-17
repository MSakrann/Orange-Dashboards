"use client";

import type { DeptStructure } from "@/data/dept-structure";
import { DeptGlance } from "./dept-glance";
import { DeptHero } from "./dept-hero";
import { DeptHighlighted } from "./dept-highlighted";
import { DeptMission } from "./dept-mission";
import { DeptProjectDeepDives } from "./dept-project-deep-dives";
import { DeptStructureGrid } from "./dept-structure-grid";
import { DeptTeamChapters } from "./dept-team-chapters";
import { DeptTimeline } from "./dept-timeline";

export function DeptPortfolio({ data }: { data: DeptStructure }) {
  const projectCountByTeam = new Map<string, number>();
  for (const project of data.projects) {
    if (!project.teamId) continue;
    projectCountByTeam.set(project.teamId, (projectCountByTeam.get(project.teamId) ?? 0) + 1);
  }

  const highlighted = data.projects.filter((project) => project.isHighlighted).slice(0, 3);

  return (
    <main className="dept-portfolio">
      <DeptHero profile={data.profile} />
      <DeptGlance profile={data.profile} />
      <DeptMission mission={data.profile.mission} />
      <DeptStructureGrid
        headName={data.profile.departmentHeadName}
        headTitle={data.profile.departmentHeadTitle}
        teams={data.teams}
        projectCountByTeam={projectCountByTeam}
      />
      <DeptTeamChapters teams={data.teams} />
      <DeptHighlighted projects={highlighted} teams={data.teams} />
      <DeptProjectDeepDives projects={data.projects} teams={data.teams} />
      <DeptTimeline items={data.timeline} />
    </main>
  );
}
