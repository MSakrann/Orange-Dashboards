"use client";

import type { DeptStructure } from "@/data/dept-structure";
import { DeptGlance } from "./dept-glance";
import { DeptHero } from "./dept-hero";
import { DeptMission } from "./dept-mission";
import { DeptStructureGrid } from "./dept-structure-grid";
import { DeptTeamChapters } from "./dept-team-chapters";

export function DeptPortfolio({ data }: { data: DeptStructure }) {
  return (
    <main className="dept-portfolio">
      <DeptHero profile={data.profile} />
      <DeptGlance profile={data.profile} />
      <DeptMission mission={data.profile.mission} />
      <DeptStructureGrid
        headName={data.profile.departmentHeadName}
        headTitle={data.profile.departmentHeadTitle}
        teams={data.teams}
      />
      <DeptTeamChapters teams={data.teams} />
    </main>
  );
}
