import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeptPortfolio } from "@/components/dept-structure/dept-portfolio";
import { fixtureDeptStructure } from "@/data/dept-structure";

describe("DeptPortfolio", () => {
  it("renders brand, glance stats, and five teams", () => {
    render(<DeptPortfolio data={fixtureDeptStructure} />);

    expect(screen.getByText("Orange Egypt")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Technology Delivery Department",
    );
    expect(screen.getByText("At a glance")).toBeInTheDocument();
    expect(screen.getAllByText("PE Development").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Data Lake Operations").length).toBeGreaterThan(0);
    expect(screen.getByText("Highlighted projects")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("reflows structure cleanly with four teams", () => {
    const fourTeams = {
      ...fixtureDeptStructure,
      teams: fixtureDeptStructure.teams.slice(0, 4),
    };
    const { container } = render(<DeptPortfolio data={fourTeams} />);
    expect(container.querySelector(".dept-team-grid.count-4")).toBeTruthy();
  });
});
