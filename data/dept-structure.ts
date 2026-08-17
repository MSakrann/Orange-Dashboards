export interface DeptMember {
  id: string;
  teamId: string;
  name: string;
  role: string;
  sortOrder: number;
}

export interface DeptTeam {
  id: string;
  name: string;
  leadName: string;
  focus: string;
  goal: string;
  scope: string;
  sortOrder: number;
  members: DeptMember[];
}

export interface DeptMilestone {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  isDone: boolean;
  sortOrder: number;
}

export interface DeptProject {
  id: string;
  teamId: string | null;
  title: string;
  summary: string;
  isHighlighted: boolean;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  progressPct: number;
  statusLabel: string;
  sortOrder: number;
  milestones: DeptMilestone[];
}

export interface DeptTimelineItem {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  statusLabel: string;
  sortOrder: number;
}

export interface DeptProfile {
  id: string;
  brandName: string;
  heroHeadline: string;
  heroSupport: string;
  mission: string;
  departmentHeadName: string;
  departmentHeadTitle: string;
  statTeams: number;
  statMembers: number;
  statActiveProjects: number;
  statOnTrackPct: number;
  updatedAt: string;
}

export interface DeptStructure {
  profile: DeptProfile;
  teams: DeptTeam[];
  projects: DeptProject[];
  timeline: DeptTimelineItem[];
}

const PROFILE_ID = "90000000-0000-4000-8000-000000000001";

export const fixtureDeptStructure: DeptStructure = {
  profile: {
    id: PROFILE_ID,
    brandName: "Orange Egypt",
    heroHeadline: "Technology Delivery Department",
    heroSupport: "People, platforms, and operations that keep Orange Egypt shipping.",
    mission:
      "We design, build, and run the digital platforms that power Orange Egypt — aligning engineering, operations, and data so delivery stays clear, measurable, and on track.",
    departmentHeadName: "Mouhab Mahmoud",
    departmentHeadTitle: "Department Head",
    statTeams: 5,
    statMembers: 28,
    statActiveProjects: 12,
    statOnTrackPct: 83,
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
  teams: [
    {
      id: "91000000-0000-4000-8000-000000000001",
      name: "PE Development",
      leadName: "Sara Hassan",
      focus: "Platform engineering product delivery and reliability features.",
      goal: "Ship PE capabilities with predictable releases and clear ownership.",
      scope: "Core PE product streams",
      sortOrder: 0,
      members: [
        { id: "92000000-0000-4000-8000-000000000001", teamId: "91000000-0000-4000-8000-000000000001", name: "Sara Hassan", role: "Team Lead", sortOrder: 0 },
        { id: "92000000-0000-4000-8000-000000000002", teamId: "91000000-0000-4000-8000-000000000001", name: "Ahmed Saleh", role: "Engineer", sortOrder: 1 },
        { id: "92000000-0000-4000-8000-000000000003", teamId: "91000000-0000-4000-8000-000000000001", name: "Lina Mostafa", role: "Engineer", sortOrder: 2 },
      ],
    },
    {
      id: "91000000-0000-4000-8000-000000000002",
      name: "Platform Development",
      leadName: "Omar Khalil",
      focus: "Shared platform services, tooling, and developer experience.",
      goal: "Provide stable foundations teams can build on without friction.",
      scope: "Shared platform & DX",
      sortOrder: 1,
      members: [
        { id: "92000000-0000-4000-8000-000000000004", teamId: "91000000-0000-4000-8000-000000000002", name: "Omar Khalil", role: "Team Lead", sortOrder: 0 },
        { id: "92000000-0000-4000-8000-000000000005", teamId: "91000000-0000-4000-8000-000000000002", name: "Hana Magdy", role: "Engineer", sortOrder: 1 },
        { id: "92000000-0000-4000-8000-000000000006", teamId: "91000000-0000-4000-8000-000000000002", name: "Tarek Nabil", role: "Engineer", sortOrder: 2 },
      ],
    },
    {
      id: "91000000-0000-4000-8000-000000000003",
      name: "PE Operations",
      leadName: "Nour El-Din",
      focus: "Day-to-day PE ops, escalations, and service health.",
      goal: "Keep PE services healthy with fast response and clear runbooks.",
      scope: "PE run & escalate",
      sortOrder: 2,
      members: [
        { id: "92000000-0000-4000-8000-000000000007", teamId: "91000000-0000-4000-8000-000000000003", name: "Nour El-Din", role: "Team Lead", sortOrder: 0 },
        { id: "92000000-0000-4000-8000-000000000008", teamId: "91000000-0000-4000-8000-000000000003", name: "Mai Ibrahim", role: "Ops Engineer", sortOrder: 1 },
      ],
    },
    {
      id: "91000000-0000-4000-8000-000000000004",
      name: "Development Operations",
      leadName: "Yasmine Farid",
      focus: "CI/CD, environments, and delivery operations.",
      goal: "Make every release repeatable, observable, and low-drama.",
      scope: "Build, release, environments",
      sortOrder: 3,
      members: [
        { id: "92000000-0000-4000-8000-000000000009", teamId: "91000000-0000-4000-8000-000000000004", name: "Yasmine Farid", role: "Team Lead", sortOrder: 0 },
        { id: "92000000-0000-4000-8000-00000000000a", teamId: "91000000-0000-4000-8000-000000000004", name: "Ramy Fouad", role: "DevOps Engineer", sortOrder: 1 },
      ],
    },
    {
      id: "91000000-0000-4000-8000-000000000005",
      name: "Data Lake Operations",
      leadName: "Karim Adel",
      focus: "Data lake reliability, pipelines, and operational readiness.",
      goal: "Keep lake workloads trustworthy and on-SLA for consumers.",
      scope: "Lake ops & pipelines",
      sortOrder: 4,
      members: [
        { id: "92000000-0000-4000-8000-00000000000b", teamId: "91000000-0000-4000-8000-000000000005", name: "Karim Adel", role: "Team Lead", sortOrder: 0 },
        { id: "92000000-0000-4000-8000-00000000000c", teamId: "91000000-0000-4000-8000-000000000005", name: "Dina Samir", role: "Data Engineer", sortOrder: 1 },
      ],
    },
  ],
  projects: [
    {
      id: "93000000-0000-4000-8000-000000000001",
      teamId: "91000000-0000-4000-8000-000000000001",
      title: "PE Delivery Cockpit",
      summary: "Unified view of PE delivery health, risks, and upcoming releases.",
      isHighlighted: true,
      ownerName: "Sara Hassan",
      startDate: "2026-03-01",
      endDate: "2026-09-30",
      progressPct: 62,
      statusLabel: "On track",
      sortOrder: 0,
      milestones: [
        { id: "94000000-0000-4000-8000-000000000001", projectId: "93000000-0000-4000-8000-000000000001", title: "MVP cockpit live", dueDate: "2026-06-30", isDone: true, sortOrder: 0 },
        { id: "94000000-0000-4000-8000-000000000002", projectId: "93000000-0000-4000-8000-000000000001", title: "Risk signals wired", dueDate: "2026-08-15", isDone: false, sortOrder: 1 },
      ],
    },
    {
      id: "93000000-0000-4000-8000-000000000002",
      teamId: "91000000-0000-4000-8000-000000000002",
      title: "Platform Foundations 2.0",
      summary: "Harden shared services and cut onboarding time for consuming teams.",
      isHighlighted: true,
      ownerName: "Omar Khalil",
      startDate: "2026-02-15",
      endDate: "2026-11-15",
      progressPct: 48,
      statusLabel: "On track",
      sortOrder: 1,
      milestones: [
        { id: "94000000-0000-4000-8000-000000000003", projectId: "93000000-0000-4000-8000-000000000002", title: "Service catalog v1", dueDate: "2026-07-01", isDone: true, sortOrder: 0 },
      ],
    },
    {
      id: "93000000-0000-4000-8000-000000000003",
      teamId: "91000000-0000-4000-8000-000000000004",
      title: "Release Pipeline Unification",
      summary: "Standardize CI/CD across delivery teams with shared gates and observability.",
      isHighlighted: true,
      ownerName: "Yasmine Farid",
      startDate: "2026-04-01",
      endDate: "2026-10-31",
      progressPct: 35,
      statusLabel: "At risk",
      sortOrder: 2,
      milestones: [
        { id: "94000000-0000-4000-8000-000000000004", projectId: "93000000-0000-4000-8000-000000000003", title: "Pilot pipelines migrated", dueDate: "2026-08-31", isDone: false, sortOrder: 0 },
      ],
    },
    {
      id: "93000000-0000-4000-8000-000000000004",
      teamId: "91000000-0000-4000-8000-000000000005",
      title: "Lake SLA Dashboard",
      summary: "Operational dashboard for lake pipeline SLAs and consumer impact.",
      isHighlighted: false,
      ownerName: "Karim Adel",
      startDate: "2026-05-01",
      endDate: "2026-12-15",
      progressPct: 22,
      statusLabel: "In progress",
      sortOrder: 3,
      milestones: [],
    },
  ],
  timeline: [
    {
      id: "95000000-0000-4000-8000-000000000001",
      label: "Q2 foundation hardening",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      statusLabel: "Complete",
      sortOrder: 0,
    },
    {
      id: "95000000-0000-4000-8000-000000000002",
      label: "Q3 delivery cockpit rollout",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      statusLabel: "In progress",
      sortOrder: 1,
    },
    {
      id: "95000000-0000-4000-8000-000000000003",
      label: "Q4 pipeline unification",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      statusLabel: "Planned",
      sortOrder: 2,
    },
  ],
};
