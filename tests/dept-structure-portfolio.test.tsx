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
    expect(screen.getByRole("heading", { name: "Teams" })).toBeInTheDocument();
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
          sortOrder: 5,
          members: [],
        },
      ],
    };
    const { container } = render(<DeptPortfolio data={sixTeams} />);
    expect(container.querySelector(".dept-team-grid.count-6")).toBeTruthy();
  });
});
