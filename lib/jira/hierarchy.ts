import type { MappedJiraIssue } from "@/lib/jira/types";

/**
 * Dashboard work items only support project → subtask (one parent level).
 * Flatten deeper Jira trees (Epic → Story → Sub-task) onto the nearest root.
 */
export function partitionMappedIssues(mapped: MappedJiraIssue[]) {
  const byId = new Map(mapped.map((issue) => [issue.jiraIssueId, issue]));

  function isRoot(issue: MappedJiraIssue) {
    return !issue.parentJiraIssueId || !byId.has(issue.parentJiraIssueId);
  }

  function rootAncestorId(issue: MappedJiraIssue): string | null {
    if (isRoot(issue)) return null;

    let currentParentId = issue.parentJiraIssueId as string;
    const visited = new Set<string>();

    while (!visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = byId.get(currentParentId);
      if (!parent || isRoot(parent)) return currentParentId;
      if (!parent.parentJiraIssueId) return currentParentId;
      currentParentId = parent.parentJiraIssueId;
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
