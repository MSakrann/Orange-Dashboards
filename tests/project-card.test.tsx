import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectCard } from "@/components/dashboard/project-card";
import type { DashboardProject } from "@/lib/data/dashboard";

function makeProject(overrides: Partial<DashboardProject> = {}): DashboardProject {
  return {
    id: "p1",
    title: "Sample project",
    description: "",
    status: "in-progress",
    statusId: "s1",
    statusName: "Planning",
    statusColor: "#23b123",
    reportingCategory: "active",
    owner: "Alex Owner",
    ownerRole: "Lead",
    priority: "medium",
    progress: 40,
    startDate: "2026-01-01",
    endDate: "2020-01-01",
    sortOrder: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    syncSource: "jira",
    comments: [],
    subtasks: [],
    ...overrides,
  };
}

describe("ProjectCard Dev Ops options", () => {
  it("hides owner, progress, and view button while opening on card click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ProjectCard
        project={makeProject()}
        onOpen={onOpen}
        showOwner={false}
        showProgress={false}
        showDetailsButton={false}
        openOnCardClick
        showOverdueTag
      />,
    );

    expect(screen.queryByText("Alex Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector(".details-button")).toBeNull();
    expect(screen.getByLabelText("Target date passed")).toHaveTextContent("Delayed");

    await user.click(screen.getByRole("button", { name: "View Sample project details" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not show overdue tag when target date is in the future", () => {
    render(
      <ProjectCard
        project={makeProject({ endDate: "2099-12-31" })}
        onOpen={() => undefined}
        showOverdueTag
      />,
    );
    expect(screen.queryByLabelText("Target date passed")).not.toBeInTheDocument();
  });
});
