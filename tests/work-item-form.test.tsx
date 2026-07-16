import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkItemForm, validateWorkItemDraft } from "@/components/admin/work-item-form";

const statuses = [
  {
    id: "status-a",
    name: "In Progress",
    color: "#123456",
    sortOrder: 0,
    reportingCategory: "active" as const,
    updatedAt: "",
  },
];

describe("validateWorkItemDraft", () => {
  it("requires a title and status", () => {
    expect(validateWorkItemDraft({
      title: " ",
      description: "",
      statusId: "",
      priority: "medium",
      progress: "0",
      startDate: "",
      endDate: "",
      assignee: "",
    })).toEqual({
      title: "Title is required.",
      statusId: "Status is required.",
    });
  });

  it.each(["-1", "101", "not-a-number"])("rejects invalid progress %s", (progress) => {
    expect(validateWorkItemDraft({
      title: "Project",
      description: "",
      statusId: "status-a",
      priority: "medium",
      progress,
      startDate: "",
      endDate: "",
      assignee: "",
    }).progress).toBe("Progress must be a whole number from 0 to 100.");
  });

  it("treats blank progress as required instead of coercing it to zero", () => {
    expect(validateWorkItemDraft({
      title: "Project",
      description: "",
      statusId: "status-a",
      priority: "medium",
      progress: "   ",
      startDate: "",
      endDate: "",
      assignee: "",
    }).progress).toBe("Progress is required.");
  });

  it("rejects an end date before the start date", () => {
    expect(validateWorkItemDraft({
      title: "Project",
      description: "",
      statusId: "status-a",
      priority: "medium",
      progress: "10",
      startDate: "2026-07-20",
      endDate: "2026-07-19",
      assignee: "",
    }).endDate).toBe("End date must be on or after the start date.");
  });

  it("enforces work-item text bounds", () => {
    const base = {
      title: "Project",
      description: "",
      statusId: "status-a",
      priority: "medium" as const,
      progress: "10",
      startDate: "",
      endDate: "",
      assignee: "",
    };
    expect(validateWorkItemDraft({ ...base, title: "x".repeat(201) }).title)
      .toMatch(/200 characters/i);
    expect(validateWorkItemDraft({ ...base, assignee: "x".repeat(201) }).assignee)
      .toMatch(/200 characters/i);
    expect(validateWorkItemDraft({ ...base, description: "x".repeat(10_001) }).description)
      .toMatch(/10000 characters/i);
  });
});

describe("WorkItemForm", () => {
  it("submits a normalized project payload once while saving", async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    }));
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "  New project  ");
    await user.type(screen.getByLabelText("Description"), " Description ");
    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "35");
    await user.type(screen.getByLabelText("Assignee"), " Avery ");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.click(screen.getByRole("button", { name: "Saving" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      title: "New project",
      description: "Description",
      statusId: "status-a",
      priority: "medium",
      progress: 35,
      startDate: null,
      endDate: null,
      assignee: "Avery",
    });
    resolveSubmit();
  });

  it("shows clear validation errors without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkItemForm
        kind="subtask"
        statuses={statuses}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "150");
    await user.click(screen.getByRole("button", { name: "Create subtask" }));

    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Progress must be a whole number from 0 to 100.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes matching browser text limits", () => {
    render(
      <WorkItemForm
        kind="project"
        statuses={statuses}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Description")).toHaveAttribute("maxlength", "10000");
    expect(screen.getByLabelText("Assignee")).toHaveAttribute("maxlength", "200");
  });
});
