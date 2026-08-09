import type { MappedJiraIssue } from "@/lib/jira/types";

/**
 * Dashboard work items only support project → subtask (one parent level).
 * Flatten deeper Jira trees (Epic → Story → Sub-task) onto the nearest root.
 *
 * Parent links come from Jira `parent` and/or Epic Link (resolved to id via key).
 */
export function partitionMappedIssues(mapped: MappedJiraIssue[]) {
  const byId = new Map(mapped.map((issue) => [issue.jiraIssueId, issue]));
  const byKey = new Map(mapped.map((issue) => [issue.jiraIssueKey, issue]));

  function resolveParentId(issue: MappedJiraIssue): string | null {
    if (issue.parentJiraIssueId && byId.has(issue.parentJiraIssueId)) {
      return issue.parentJiraIssueId;
    }
    if (issue.parentJiraIssueKey) {
      const parent = byKey.get(issue.parentJiraIssueKey);
      if (parent) return parent.jiraIssueId;
    }
    return issue.parentJiraIssueId;
  }

  function isRoot(issue: MappedJiraIssue) {
    const parentId = resolveParentId(issue);
    return !parentId || !byId.has(parentId);
  }

  function rootAncestorId(issue: MappedJiraIssue): string | null {
    if (isRoot(issue)) return null;

    let currentParentId = resolveParentId(issue) as string;
    const visited = new Set<string>();

    while (!visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = byId.get(currentParentId);
      if (!parent || isRoot(parent)) return currentParentId;
      const nextParentId = resolveParentId(parent);
      if (!nextParentId) return currentParentId;
      currentParentId = nextParentId;
    }

    return null;
  }

  const projects = mapped.filter((issue) => isRoot(issue));
  const children: Array<{ issue: MappedJiraIssue; parentJiraIssueId: string }> = [];

  for (const issue of mapped) {
    const parentJiraIssueId = rootAncestorId(issue);
    if (!parentJiraIssueId) continue;
    children.push({ issue, parentJiraIssueId });
  }

  return { projects, children };
}
