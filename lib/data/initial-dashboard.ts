import type { Workspace } from "@/data/workspaces";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  aggregateKpis,
  groupStatuses,
  type DashboardProject,
  type DashboardStatus,
  type DashboardViewModel,
  type ReportingCategory,
} from "./dashboard";

export type DashboardSource = "database" | "fixture";

interface InitialDashboardDependencies<Client> {
  envConfigured: boolean;
  createClient: () => Promise<Client>;
  load: (client: Client, workspaceSlug: string) => Promise<DashboardViewModel | null>;
  getAdminStatus: (client: Client) => Promise<boolean>;
  getFixture: (workspaceSlug: string) => DashboardViewModel | undefined;
}

export async function getAdminStatus(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export async function resolveInitialDashboard<Client>(
  workspaceSlug: string,
  dependencies: InitialDashboardDependencies<Client>,
): Promise<{
  dashboard: DashboardViewModel | null;
  source: DashboardSource;
  isAdmin: boolean;
}> {
  if (!dependencies.envConfigured) {
    return {
      dashboard: dependencies.getFixture(workspaceSlug) ?? null,
      source: "fixture",
      isAdmin: false,
    };
  }

  const client = await dependencies.createClient();
  const [dashboard, isAdmin] = await Promise.all([
    dependencies.load(client, workspaceSlug),
    dependencies.getAdminStatus(client),
  ]);
  return {
    dashboard,
    source: "database",
    isAdmin,
  };
}

const fixtureStatusDefinitions: Array<{
  legacyStatus: DashboardProject["status"];
  name: string;
  category: ReportingCategory;
  color: string;
}> = [
  { legacyStatus: "in-progress", name: "In Progress", category: "active", color: "#237b4b" },
  { legacyStatus: "at-risk", name: "At Risk", category: "risk", color: "#a94806" },
  { legacyStatus: "delayed", name: "Delayed", category: "delayed", color: "#b63027" },
  { legacyStatus: "completed", name: "Completed", category: "completed", color: "#246a91" },
];

export function mapFixtureWorkspace(workspace: Workspace): DashboardViewModel {
  const statuses: DashboardStatus[] = fixtureStatusDefinitions.map((definition, sortOrder) => ({
    id: `fixture-${definition.legacyStatus}`,
    name: definition.name,
    color: definition.color,
    sortOrder,
    reportingCategory: definition.category,
    updatedAt: "",
  }));
  const statusByLegacyName = new Map(
    fixtureStatusDefinitions.map((definition, index) => [
      definition.legacyStatus,
      statuses[index],
    ]),
  );
  const projects: DashboardProject[] = workspace.projects.map((project, sortOrder) => {
    const status = statusByLegacyName.get(project.status);
    if (!status) throw new Error(`Unsupported fixture status: ${project.status}`);
    return {
      ...project,
      statusId: status.id,
      statusName: status.name,
      statusColor: status.color,
      reportingCategory: status.reportingCategory,
      sortOrder,
      updatedAt: "",
      syncSource: "local" as const,
      comments: project.comments.map((comment, index) => ({
        id: `fixture-${project.id}-comment-${index}`,
        ...comment,
        createdAt: "",
        updatedAt: "",
      })),
      subtasks: [],
    };
  });

  return {
    id: `fixture-${workspace.slug}`,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    jiraLinked: false,
    statuses,
    statusGroups: groupStatuses(statuses),
    projects,
    kpis: aggregateKpis(projects),
  };
}
