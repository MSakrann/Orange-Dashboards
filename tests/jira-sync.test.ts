import { describe, expect, it } from "vitest";
import { getJiraConnectionForSlug, isJiraWorkspaceSlug } from "@/lib/jira/config";
import { mapJiraIssue } from "@/lib/jira/map-issue";
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
