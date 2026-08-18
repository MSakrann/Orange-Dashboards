import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeptPortfolio } from "@/components/dept-structure/dept-portfolio";
import { fixtureDeptStructure } from "@/data/dept-structure";

describe("DeptPortfolio", () => {
  it("renders hero, structure, and teams without removed sections", () => {
    render(<DeptPortfolio data={fixtureDeptStructure} />);

    expect(screen.getByText("Orange Egypt")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Transformation and Operational Efficiency Department",
    );
    expect(screen.getByText("At a glance")).toBeInTheDocument();
    expect(screen.getByText("Functions")).toBeInTheDocument();
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams" })).toBeInTheDocument();
    expect(screen.getByText("44 active, 24 in development")).toBeInTheDocument();
    expect(screen.getAllByText(/1 project/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Highlighted projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Project deep-dives")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
  });

  it("supports six-team layout class", () => {
    const sixTeams = {
      ...fixtureDeptStructure,
      teams: [
        ...fixtureDeptStructure.teams,
        {
          id: "91000000-0000-4000-8000-000000000006",
          name: "Architecture",
          leadName: "Nada",
          focus: "Platform architecture",
          goal: "Guide decisions",
          scope: "Architecture",
          activitySummary: "6 active",
          projectCount: 2,
          sortOrder: 5,
          members: [],
        },
      ],
    };
    const { container } = render(<DeptPortfolio data={sixTeams} />);
    expect(container.querySelector(".dept-team-grid.count-6")).toBeTruthy();
    expect(screen.getByText("6 active")).toBeInTheDocument();
  });

  it("hides empty activity fields", () => {
    const emptyActivity = {
      ...fixtureDeptStructure,
      teams: fixtureDeptStructure.teams.map((team, index) =>
        index === 0 ? { ...team, activitySummary: "" } : team,
      ),
    };
    render(<DeptPortfolio data={emptyActivity} />);
    expect(screen.queryByText("44 active, 24 in development")).not.toBeInTheDocument();
    expect(screen.getAllByText("Activity")).toHaveLength(4);
  });

  it("hides empty glance stats and project counts", () => {
    const emptyCounts = {
      ...fixtureDeptStructure,
      profile: {
        ...fixtureDeptStructure.profile,
        statTeams: null,
        statMembers: 41,
        statActiveProjects: null,
      },
      teams: fixtureDeptStructure.teams.map((team) => ({ ...team, projectCount: null })),
    };
    const { container } = render(<DeptPortfolio data={emptyCounts} />);

    expect(screen.getByText("At a glance")).toBeInTheDocument();
    expect(container.querySelector(".dept-glance-grid.count-1")).toBeTruthy();
    expect(container.querySelector(".dept-glance-label")?.textContent).toBe("Members");
    expect(screen.queryByText("Functions")).not.toBeInTheDocument();
    expect(screen.queryByText("Active projects")).not.toBeInTheDocument();
    expect(screen.queryByText(/· \d+ projects?/)).not.toBeInTheDocument();
  });

  it("hides the glance section when every stat is empty", () => {
    const noGlance = {
      ...fixtureDeptStructure,
      profile: {
        ...fixtureDeptStructure.profile,
        statTeams: null,
        statMembers: null,
        statActiveProjects: null,
      },
    };
    render(<DeptPortfolio data={noGlance} />);
    expect(screen.queryByText("At a glance")).not.toBeInTheDocument();
  });
});
