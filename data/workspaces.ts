export const projectStatuses = [
  "in-progress",
  "at-risk",
  "delayed",
  "completed",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectPriority = "high" | "medium" | "low";

export interface ProjectComment {
  author: string;
  text: string;
}

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  owner: string;
  ownerRole?: string;
  priority: ProjectPriority;
  progress: number;
  startDate?: string;
  endDate?: string;
  description: string;
  comments: ProjectComment[];
}

export interface Workspace {
  slug: string;
  name: string;
  description: string;
  projects: Project[];
}

const sharedProjects: Project[] = [
  {
    id: "operations-tickets",
    title: "Operations Team Open Tickets",
    status: "in-progress",
    owner: "Marwa Saleh",
    ownerRole: "Operations lead",
    priority: "high",
    progress: 72,
    startDate: "2026-05-15",
    endDate: "2026-08-01",
    description: "Open tickets: 10. Pending tickets: 8. SD Manager open tickets: 5.",
    comments: [{ author: "Marwa", text: "One service desk item is still pending." }],
  },
  {
    id: "ticketing-system",
    title: "Ops Received Requests Ticketing System",
    status: "completed",
    owner: "Marwa Saleh",
    ownerRole: "Operations lead",
    priority: "medium",
    progress: 100,
    startDate: "2026-05-15",
    endDate: "2026-06-20",
    description: "SD Manager is configured and in active use.",
    comments: [],
  },
  {
    id: "hardware-2026",
    title: "2026 Hardware With Networks Team",
    status: "at-risk",
    owner: "Mouhab Mahmoud",
    ownerRole: "Program owner",
    priority: "high",
    progress: 45,
    startDate: "2026-05-15",
    endDate: "2026-09-30",
    description: "Coordinate server acquisition and delivery to the data centers.",
    comments: [{ author: "Mouhab", text: "Following up on the power survey." }],
  },
  {
    id: "openshift-license",
    title: "OpenShift License",
    status: "delayed",
    owner: "Mouhab Mahmoud",
    ownerRole: "Program owner",
    priority: "medium",
    progress: 50,
    startDate: "2026-05-01",
    description: "License options are under technical and commercial review.",
    comments: [],
  },
];

function workspaceProjects(prefix: string, focusTitle: string): Project[] {
  return [
    {
      id: `${prefix}-focus`,
      title: focusTitle,
      status: "in-progress",
      owner: "Mouhab Mahmoud",
      ownerRole: "Program owner",
      priority: "high",
      progress: 80,
      startDate: "2026-06-01",
      endDate: "2026-08-15",
      description: `Coordinating delivery priorities for ${focusTitle.toLowerCase()}.`,
      comments: [{ author: "Mouhab", text: "The next delivery checkpoint is scheduled." }],
    },
    ...sharedProjects.map((project) => ({ ...project, id: `${prefix}-${project.id}` })),
  ];
}

export const workspaces: Workspace[] = [
  {
    slug: "hot-topics",
    name: "Hot Topics Daily Follow-up",
    description: "Daily visibility across the initiatives that need focused follow-up.",
    projects: workspaceProjects("hot", "Daily Priority Follow-ups"),
  },
  {
    slug: "pe-development",
    name: "PE Development",
    description: "Delivery health and milestones for the promo engine team.",
    projects: workspaceProjects("pe", "PE Team Projects Management"),
  },
  {
    slug: "platform-development",
    name: "Platform Development",
    description: "Platform delivery, infrastructure, and operational readiness.",
    projects: workspaceProjects("platform", "Development Team Projects Management"),
  },
];

export function getWorkspace(slug: string): Workspace | undefined {
  return workspaces.find((workspace) => workspace.slug === slug);
}
