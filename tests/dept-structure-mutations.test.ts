import { describe, expect, it } from "vitest";
import {
  validateMemberInput,
  validateProfileInput,
  validateProjectInput,
  validateTeamInput,
  validateTimelineInput,
  DeptMutationError,
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

  it("requires team name", () => {
    expect(() =>
      validateTeamInput({
        name: "   ",
        leadName: "",
        focus: "",
        goal: "",
        scope: "",
        sortOrder: 0,
      }),
    ).toThrow(/Team name is required/);
  });

  it("requires member name", () => {
    expect(() =>
      validateMemberInput({ name: "", role: "Engineer", sortOrder: 0 }),
    ).toThrow(/Member name is required/);
  });

  it("validates project progress bounds", () => {
    expect(() =>
      validateProjectInput({
        teamId: null,
        title: "Project",
        summary: "",
        isHighlighted: false,
        ownerName: "",
        startDate: null,
        endDate: null,
        progressPct: -1,
        statusLabel: "",
        sortOrder: 0,
      }),
    ).toThrow(/Progress/);
  });

  it("requires timeline label", () => {
    expect(() =>
      validateTimelineInput({
        label: " ",
        startDate: null,
        endDate: null,
        statusLabel: "",
        sortOrder: 0,
      }),
    ).toThrow(/Timeline label is required/);
  });
});

describe("loadDeptStructure", () => {
  it("returns fixture data when client is null", async () => {
    const data = await loadDeptStructure(null);
    expect(data.profile.brandName).toBe(fixtureDeptStructure.profile.brandName);
    expect(data.teams).toHaveLength(5);
    expect(data.projects.filter((p) => p.isHighlighted)).toHaveLength(3);
  });
});
