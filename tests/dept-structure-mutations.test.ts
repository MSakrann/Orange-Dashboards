import { describe, expect, it } from "vitest";
import {
  DeptMutationError,
  validateMemberInput,
  validateProfileInput,
  validateTeamInput,
} from "@/lib/data/dept-structure-mutations";
import { loadDeptStructure } from "@/lib/data/dept-structure";
import { fixtureDeptStructure } from "@/data/dept-structure";

describe("dept-structure mutations validation", () => {
  it("accepts a valid profile", () => {
    expect(
      validateProfileInput({
        brandName: " Orange Egypt ",
        heroHeadline: "Dept",
        heroSupport: "Support",
        mission: "Mission",
        departmentHeadName: "Head",
        departmentHeadTitle: "Title",
        statTeams: 5,
        statMembers: 28,
        statActiveProjects: 12,
        statOnTrackPct: 83,
      }).brandName,
    ).toBe("Orange Egypt");
  });

  it("rejects invalid on-track percent", () => {
    expect(() =>
      validateProfileInput({
        brandName: "Orange Egypt",
        heroHeadline: "Dept",
        heroSupport: "",
        mission: "",
        departmentHeadName: "",
        departmentHeadTitle: "",
        statTeams: 1,
        statMembers: 1,
        statActiveProjects: 1,
        statOnTrackPct: 101,
      }),
    ).toThrow(DeptMutationError);
  });

  it("requires team name and keeps activity summary", () => {
    expect(() =>
      validateTeamInput({
        name: "   ",
        leadName: "",
        focus: "",
        goal: "",
        scope: "",
        activitySummary: "44 active",
        sortOrder: 0,
      }),
    ).toThrow(/Team name is required/);

    expect(
      validateTeamInput({
        name: "Team",
        leadName: "Lead",
        focus: "Focus",
        goal: "Goal",
        scope: "Scope",
        activitySummary: "44 active, 24 in development",
        sortOrder: 0,
      }).activitySummary,
    ).toBe("44 active, 24 in development");
  });

  it("requires member name", () => {
    expect(() => validateMemberInput({ name: "", role: "Engineer", sortOrder: 0 })).toThrow(
      /Member name is required/,
    );
  });
});

describe("loadDeptStructure", () => {
  it("returns fixture data when client is null", async () => {
    const data = await loadDeptStructure(null);
    expect(data.profile.brandName).toBe(fixtureDeptStructure.profile.brandName);
    expect(data.teams).toHaveLength(5);
    expect(data.teams[0]?.activitySummary).toContain("active");
  });
});
