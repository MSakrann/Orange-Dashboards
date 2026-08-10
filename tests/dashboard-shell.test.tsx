import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/view-states";
import type { Workspace } from "@/data/workspaces";
import { mapFixtureWorkspace } from "@/lib/data/initial-dashboard";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const workspace: Workspace = {
  slug: "test-workspace",
  name: "Test Workspace",
  description: "A focused delivery view",
  projects: [
    {
      id: "alpha",
      title: "Alpha rollout",
      status: "in-progress",
      owner: "Avery Stone",
      ownerRole: "Delivery lead",
      priority: "high",
      progress: 72,
      startDate: "2026-06-01",
      endDate: "2026-08-15",
      description: "<strong>Literal, safely rendered text</strong>",
      comments: [{ author: "Avery", text: "Ready for the next checkpoint." }],
    },
    {
      id: "beta",
      title: "Beta migration",
      status: "completed",
      owner: "Morgan Lee",
      priority: "medium",
      progress: 100,
      startDate: "2026-04-10",
      endDate: "2026-06-20",
      description: "Migration is complete.",
      comments: [],
    },
  ],
};
const dashboard = mapFixtureWorkspace(workspace);

describe("DashboardShell", () => {
  it("filters project cards by status", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    expect(screen.getByText("Alpha rollout")).toBeInTheDocument();
    expect(screen.getByText("Beta migration")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();
    expect(screen.getByText("Beta migration")).toBeInTheDocument();
  });

  it("opens an accessible project dialog and closes it with x", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    const trigger = screen.getByRole("button", { name: /view alpha rollout details/i });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Alpha rollout" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("<strong>Literal, safely rendered text</strong>")).toBeInTheDocument();
    expect(within(dialog).queryByText("Literal, safely rendered text")).not.toBeInTheDocument();

    const close = within(dialog).getByRole("button", { name: "Close project details" });
    expect(close).toHaveTextContent(/^x$/);
    await user.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("traps focus inside the dialog and makes the dashboard inert", async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    await user.click(screen.getByRole("button", { name: /view alpha rollout details/i }));

    const close = screen.getByRole("button", { name: "Close project details" });
    const dashboardElement = container.querySelector(".dashboard");
    expect(close).toHaveFocus();
    expect(dashboardElement).toHaveAttribute("inert");
    expect(dashboardElement).toHaveAttribute("aria-hidden", "true");

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("closes the project dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    await user.click(screen.getByRole("button", { name: /view alpha rollout details/i }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders loading and error states through the shell contract", () => {
    const { rerender } = render(
      <DashboardShell initialDashboard={dashboard} source="fixture" viewState="loading" />,
    );
    expect(screen.getByText("Loading projects").closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();

    rerender(<DashboardShell initialDashboard={dashboard} source="fixture" viewState="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load projects");
    expect(screen.queryByText("Alpha rollout")).not.toBeInTheDocument();
  });

  it("navigates between workspaces without a document reload", async () => {
    const user = userEvent.setup();
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Workspace" }), "hot-topics");

    expect(pushMock).toHaveBeenCalledWith("/hot-topics");
  });

  it("labels the offline build fallback and derives custom status filters", () => {
    const customDashboard = {
      ...dashboard,
      statuses: [{ ...dashboard.statuses[0], id: "custom-review", name: "Awaiting Review" }],
      projects: [{
        ...dashboard.projects[0],
        statusId: "custom-review",
        statusName: "Awaiting Review",
      }],
      kpis: { total: 1, active: 1, needsAttention: 0, completed: 0, averageProgress: 72 },
    };
    render(<DashboardShell initialDashboard={customDashboard} source="fixture" />);

    expect(screen.getByRole("status")).toHaveTextContent("Local/test fixture");
    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /Awaiting Review/i })).toHaveTextContent("1");
    expect(screen.queryByText("Total projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("shows clickable status metrics for pe-development and hides the Jira banner", async () => {
    const user = userEvent.setup();
    const peDashboard = {
      ...dashboard,
      slug: "pe-development",
      name: "PE Development",
      jiraLinked: true,
      lastJiraSyncAt: "2026-08-10T09:22:25.000Z",
      statuses: [
        { ...dashboard.statuses[0], id: "live", name: "live", color: "#23b123" },
        { ...dashboard.statuses[1], id: "pending", name: "pending", color: "#f59e0b" },
      ],
      projects: [
        {
          ...dashboard.projects[0],
          statusId: "live",
          statusName: "live",
          statusColor: "#23b123",
        },
        {
          ...dashboard.projects[1],
          statusId: "pending",
          statusName: "pending",
          statusColor: "#f59e0b",
        },
      ],
    };
    render(<DashboardShell initialDashboard={peDashboard} source="fixture" />);

    expect(screen.queryByText(/This workspace mirrors Jira/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Total projects")).not.toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Workspace status overview" });
    expect(within(overview).getByRole("button", { name: /All Projects/i })).toHaveTextContent("2");

    const liveMetric = within(overview).getByRole("button", { name: /^live/i });
    expect(liveMetric).toHaveTextContent("1");
    await user.click(liveMetric);

    expect(screen.getByText("Alpha rollout")).toBeInTheDocument();
    expect(screen.queryByText("Beta migration")).not.toBeInTheDocument();
    expect(liveMetric).toHaveAttribute("aria-pressed", "true");
  });

  it("renders arbitrary status colors only on decorative indicators", () => {
    render(<DashboardShell initialDashboard={dashboard} source="fixture" />);
    const badge = screen.getAllByText("In Progress")
      .map((element) => element.closest(".status-badge"))
      .find((element) => element !== null);
    const dot = badge?.querySelector("span");

    expect(badge).not.toHaveStyle({ color: dashboard.projects[0].statusColor });
    expect(dot).toHaveStyle({ backgroundColor: dashboard.projects[0].statusColor });
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
});

describe("view states", () => {
  it("renders focused loading, empty, and error messages", () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading projects");

    rerender(<EmptyState />);
    expect(screen.getByText("No projects found")).toBeInTheDocument();

    rerender(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load projects");
  });
});
