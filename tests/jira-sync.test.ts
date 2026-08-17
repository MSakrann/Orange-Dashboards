import { describe, expect, it } from "vitest";
import { getJiraConnectionForSlug, isJiraWorkspaceSlug } from "@/lib/jira/config";
import { partitionMappedIssues } from "@/lib/jira/hierarchy";
import { mapJiraIssue } from "@/lib/jira/map-issue";
import { inferReportingCategory, uniqueJiraStatuses } from "@/lib/jira/resolve-status";
import { verifyJiraHubSignature } from "@/lib/jira/webhook-auth";
import type { JiraConnectionConfig, JiraIssue } from "@/lib/jira/types";

const config: JiraConnectionConfig = {
  workspaceSlug: "pe-development",
  baseUrl: "https://example.atlassian.net",
  email: "sync@example.com",
  apiToken: "token",
  jql: "project = PE",
  webhookSecret: "secret",
};

describe("jira config", () => {
  it("recognizes Jira-linked workspace slugs", () => {
    expect(isJiraWorkspaceSlug("pe-development")).toBe(true);
    expect(isJiraWorkspaceSlug("platform-development")).toBe(true);
    expect(isJiraWorkspaceSlug("pe-operations")).toBe(true);
    expect(isJiraWorkspaceSlug("development-operations")).toBe(true);
    expect(isJiraWorkspaceSlug("datalake-operations")).toBe(true);
    expect(isJiraWorkspaceSlug("hot-topics")).toBe(false);
  });

  it("returns null when workspace env is not configured", () => {
    expect(getJiraConnectionForSlug("pe-development")).toBeNull();
  });
});

describe("mapJiraIssue", () => {
  it("maps summary, status, assignee, and progress from status category", () => {
    const issue: JiraIssue = {
      id: "10001",
      key: "PE-12",
      fields: {
        summary: "Upgrade billing service",
        description: "Roll out the new billing pipeline",
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        assignee: { displayName: "Alex Owner" },
        duedate: "2026-08-01",
        created: "2026-06-01T10:00:00.000Z",
        updated: "2026-07-01T12:00:00.000Z",
        priority: { name: "High" },
        parent: null,
        issuetype: { name: "Story" },
      },
    };

    const mapped = mapJiraIssue(issue, config);
    expect(mapped.title).toBe("Upgrade billing service");
    expect(mapped.jiraStatusName).toBe("In Progress");
    expect(mapped.assignee).toBe("Alex Owner");
    expect(mapped.progress).toBe(50);
    expect(mapped.priority).toBe("high");
    expect(mapped.parentJiraIssueId).toBeNull();
    expect(mapped.issueTypeName).toBe("Story");
  });

  it("resolves Epic Link custom field when parent is absent", () => {
    const issue: JiraIssue = {
      id: "10002",
      key: "PE-20",
      fields: {
        summary: "Story under epic",
        status: { name: "To Do", statusCategory: { key: "new" } },
        parent: null,
        issuetype: { name: "Story" },
        customfield_10014: "PE-1",
        updated: "2026-07-01T12:00:00.000Z",
      },
    };

    const mapped = mapJiraIssue(issue, config, { epicLinkFieldId: "customfield_10014" });
    expect(mapped.parentJiraIssueId).toBeNull();
    expect(mapped.parentJiraIssueKey).toBe("PE-1");
  });

  it("truncates long Jira descriptions to the database limit", () => {
    const issue: JiraIssue = {
      id: "10003",
      key: "PE-99",
      fields: {
        summary: "Huge description",
        description: "x".repeat(12000),
        status: { name: "To Do", statusCategory: { key: "new" } },
        updated: "2026-07-01T12:00:00.000Z",
      },
    };

    const mapped = mapJiraIssue(issue, config);
    expect(mapped.description).toHaveLength(10000);
  });
});

describe("verifyJiraHubSignature", () => {
  it("matches Atlassian sample HMAC values", () => {
    expect(
      verifyJiraHubSignature(
        "Hello World!",
        "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9",
        "It's a Secret to Everybody",
      ),
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyJiraHubSignature(
        "Hello World!",
        "sha256=deadbeef",
        "It's a Secret to Everybody",
      ),
    ).toBe(false);
  });
});

describe("partitionMappedIssues", () => {
  it("flattens Epic → Story → Sub-task onto Epic as project + two subtasks", () => {
    const epic = {
      jiraIssueId: "1",
      jiraIssueKey: "ODF-1",
      jiraUpdatedAt: "2026-01-01T00:00:00Z",
      title: "Epic",
      description: "",
      assignee: null,
      endDate: null,
      startDate: null,
      priority: "medium" as const,
      progress: 50,
      jiraStatusName: "In Progress",
      jiraStatusCategoryKey: "indeterminate",
      parentJiraIssueId: null,
      parentJiraIssueKey: null,
      issueTypeName: "Epic",
    };
    const story = {
      ...epic,
      jiraIssueId: "2",
      jiraIssueKey: "ODF-2",
      title: "Story",
      parentJiraIssueId: "1",
      parentJiraIssueKey: "ODF-1",
      issueTypeName: "Story",
    };
    const subtask = {
      ...epic,
      jiraIssueId: "3",
      jiraIssueKey: "ODF-3",
      title: "Sub",
      parentJiraIssueId: "2",
      parentJiraIssueKey: "ODF-2",
      issueTypeName: "Sub-task",
    };

    const { projects, children } = partitionMappedIssues([epic, story, subtask]);
    expect(projects.map((issue) => issue.jiraIssueId)).toEqual(["1"]);
    expect(children.map((child) => [child.issue.jiraIssueId, child.parentJiraIssueId])).toEqual([
      ["2", "1"],
      ["3", "1"],
    ]);
  });

  it("nests stories under epics when only Epic Link key is present", () => {
    const epic = {
      jiraIssueId: "10",
      jiraIssueKey: "PE-1",
      jiraUpdatedAt: "2026-01-01T00:00:00Z",
      title: "Epic",
      description: "",
      assignee: null,
      endDate: null,
      startDate: null,
      priority: "medium" as const,
      progress: 50,
      jiraStatusName: "In Progress",
      jiraStatusCategoryKey: "indeterminate",
      parentJiraIssueId: null,
      parentJiraIssueKey: null,
      issueTypeName: "Epic",
    };
    const story = {
      ...epic,
      jiraIssueId: "11",
      jiraIssueKey: "PE-2",
      title: "Story",
      parentJiraIssueId: null,
      parentJiraIssueKey: "PE-1",
      issueTypeName: "Story",
    };

    const { projects, children } = partitionMappedIssues([epic, story]);
    expect(projects.map((issue) => issue.jiraIssueId)).toEqual(["10"]);
    expect(children).toEqual([{ issue: story, parentJiraIssueId: "10" }]);
  });
});

describe("inferReportingCategory", () => {
  it("keeps Done in completed and To Do in active for KPIs only", () => {
    expect(inferReportingCategory("Done", "done")).toBe("completed");
    expect(inferReportingCategory("To Do", "new")).toBe("active");
    expect(inferReportingCategory("Blocked", "indeterminate")).toBe("risk");
  });
});

describe("uniqueJiraStatuses", () => {
  it("preserves exact Jira status names", () => {
    expect(uniqueJiraStatuses([
      { jiraStatusName: "In Review", jiraStatusCategoryKey: "indeterminate" },
      { jiraStatusName: "in review", jiraStatusCategoryKey: "indeterminate" },
      { jiraStatusName: "To Do", jiraStatusCategoryKey: "new" },
    ]).map((status) => status.name)).toEqual(["In Review", "To Do"]);
  });
});

describe("removeUnusedSeedStatuses", () => {
  it("does not delete statuses when the keep set is empty", async () => {
    const { removeUnusedSeedStatuses } = await import("@/lib/jira/ensure-statuses");
    const from = vi.fn(() => {
      throw new Error("supabase should not be queried when keep set is empty");
    });
    await expect(
      removeUnusedSeedStatuses({ from } as never, "workspace-id", new Set()),
    ).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });
});
