import { describe, expect, it } from "vitest";
import { getJiraConnectionForSlug, isJiraWorkspaceSlug } from "@/lib/jira/config";
import { partitionMappedIssues } from "@/lib/jira/hierarchy";
import { mapJiraIssue } from "@/lib/jira/map-issue";
import { resolveDashboardStatusId } from "@/lib/jira/resolve-status";
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
      },
    };

    const mapped = mapJiraIssue(issue, config);
    expect(mapped.title).toBe("Upgrade billing service");
    expect(mapped.jiraStatusName).toBe("In Progress");
    expect(mapped.assignee).toBe("Alex Owner");
    expect(mapped.progress).toBe(50);
    expect(mapped.priority).toBe("high");
    expect(mapped.parentJiraIssueId).toBeNull();
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
    };
    const story = { ...epic, jiraIssueId: "2", jiraIssueKey: "ODF-2", title: "Story", parentJiraIssueId: "1" };
    const subtask = { ...epic, jiraIssueId: "3", jiraIssueKey: "ODF-3", title: "Sub", parentJiraIssueId: "2" };

    const { projects, children } = partitionMappedIssues([epic, story, subtask]);
    expect(projects.map((issue) => issue.jiraIssueId)).toEqual(["1"]);
    expect(children.map((child) => [child.issue.jiraIssueId, child.parentJiraIssueId])).toEqual([
      ["2", "1"],
      ["3", "1"],
    ]);
  });
});

describe("resolveDashboardStatusId", () => {
  const statuses = [
    { id: "active", name: "In Progress", reporting_category: "active" },
    { id: "risk", name: "At Risk", reporting_category: "risk" },
    { id: "delayed", name: "Delayed", reporting_category: "delayed" },
    { id: "done", name: "Completed", reporting_category: "completed" },
  ];

  it("maps Done by category even without an explicit mapping row", () => {
    expect(resolveDashboardStatusId({
      jiraStatusName: "Released",
      jiraStatusCategoryKey: "done",
      statuses,
      mappings: [],
    })).toBe("done");
  });

  it("maps To Do / Backlog to active, not delayed", () => {
    expect(resolveDashboardStatusId({
      jiraStatusName: "To Do",
      jiraStatusCategoryKey: "new",
      statuses,
      mappings: [],
    })).toBe("active");
  });

  it("maps Blocked to risk via name heuristics", () => {
    expect(resolveDashboardStatusId({
      jiraStatusName: "Blocked",
      jiraStatusCategoryKey: "indeterminate",
      statuses,
      mappings: [],
    })).toBe("risk");
  });
});
