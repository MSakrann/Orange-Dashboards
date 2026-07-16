"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceRealtime } from "@/hooks/use-workspace-realtime";
import type { DashboardSource } from "@/lib/data/initial-dashboard";
import {
  aggregateKpis,
  type DashboardComment,
  type DashboardProject,
  type DashboardViewModel,
  type DashboardWorkItem,
} from "@/lib/data/dashboard";
import {
  WorkItemForm,
  type WorkItemFormValue,
} from "@/components/admin/work-item-form";
import {
  buildWorkItemPayload,
  createWorkItem,
  deleteWorkItem,
  reorderWorkItems,
  updateWorkItem,
  WORK_ITEM_CONFLICT_CODE,
  WorkItemMutationError,
} from "@/lib/data/work-item-mutations";
import {
  createComment,
  deleteComment,
  updateComment,
  type CommentInput,
} from "@/lib/data/comment-mutations";
import { createClient } from "@/lib/supabase/client";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { SessionControls } from "@/components/auth/session-controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/view-states";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { KpiGrid } from "./kpi-grid";
import { ProjectCard } from "./project-card";
import { ProjectDetailsModal } from "./project-details-modal";
import { StatusFilters, type StatusFilter } from "./status-filters";

interface DashboardShellProps {
  initialDashboard: DashboardViewModel;
  source: DashboardSource;
  isAdmin?: boolean;
  adminEmail?: string;
  viewState?: "ready" | "loading" | "error";
}

interface EditorState {
  kind: "project" | "subtask";
  parentId: string | null;
  item?: DashboardWorkItem;
}

type RetryIntent =
  | {
      kind: "create";
      itemId: string;
      parentId: string | null;
      value: WorkItemFormValue;
    }
  | {
      kind: "update";
      itemId: string;
      parentId: string | null;
      expectedUpdatedAt: string;
      value: WorkItemFormValue;
    }
  | {
      kind: "delete";
      itemId: string;
      parentId: string | null;
      expectedUpdatedAt: string;
    }
  | {
      kind: "reorder";
      itemId: string;
      parentId: string | null;
      direction: -1 | 1;
    };

interface OptimisticOperation {
  apply: (current: DashboardViewModel) => DashboardViewModel;
  execute: () => Promise<unknown>;
  retryIntent: RetryIntent;
}

const connectionLabels = {
  connecting: "Connecting",
  live: "Live",
  disconnected: "Disconnected — showing last known data",
  reconnecting: "Reconnecting — showing last known data",
  error: "Refresh error — showing last known data",
} as const;

function withProjects(
  dashboard: DashboardViewModel,
  projects: DashboardProject[],
): DashboardViewModel {
  return { ...dashboard, projects, kpis: aggregateKpis(projects) };
}

function optimisticItem(
  id: string,
  value: WorkItemFormValue,
  dashboard: DashboardViewModel,
  sortOrder: number,
  comments: DashboardWorkItem["comments"] = [],
  updatedAt = "",
): DashboardWorkItem {
  const status = dashboard.statuses.find((candidate) => candidate.id === value.statusId);
  if (!status) throw new Error("The selected status no longer exists.");
  const legacyStatus = {
    active: "in-progress",
    risk: "at-risk",
    delayed: "delayed",
    completed: "completed",
  }[status.reportingCategory] as DashboardWorkItem["status"];
  return {
    id,
    title: value.title,
    description: value.description,
    status: legacyStatus,
    statusId: status.id,
    statusName: status.name,
    statusColor: status.color,
    reportingCategory: status.reportingCategory,
    owner: value.assignee ?? "Unassigned",
    priority: value.priority,
    progress: value.progress,
    ...(value.startDate ? { startDate: value.startDate } : {}),
    ...(value.endDate ? { endDate: value.endDate } : {}),
    sortOrder,
    updatedAt,
    syncSource: "local",
    comments,
  };
}

function newItemId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function findItem(dashboard: DashboardViewModel, itemId: string) {
  for (const project of dashboard.projects) {
    if (project.id === itemId) return project;
    const subtask = project.subtasks.find((item) => item.id === itemId);
    if (subtask) return subtask;
  }
  return null;
}

interface EditorDialogProps {
  editor: EditorState;
  dashboard: DashboardViewModel;
  onSubmit: (value: WorkItemFormValue) => Promise<void>;
  onClose: () => void;
  retryNotice: {
    message: string;
    retry?: () => void;
  } | null;
}

function EditorDialog({
  editor,
  dashboard,
  onSubmit,
  onClose,
  retryNotice,
}: EditorDialogProps) {
  const noun = editor.kind === "project" ? "project" : "subtask";
  const title = `${editor.item ? "Edit" : "New"} ${noun}`;
  return (
    <ModalDialog
      labelledBy="work-item-editor-title"
      closeLabel={`Close ${noun} form`}
      onClose={onClose}
      className="admin-modal"
    >
      <p className="eyebrow">Administration</p>
      <h2 id="work-item-editor-title">{title}</h2>
      {retryNotice?.retry ? (
        <div className="mutation-notice" role="alert">
          <span>{retryNotice.message}</span>
          <button type="button" onClick={retryNotice.retry}>Retry</button>
        </div>
      ) : null}
      <WorkItemForm
        kind={editor.kind}
        statuses={dashboard.statuses}
        initialValue={editor.item}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </ModalDialog>
  );
}

export function DashboardShell({
  initialDashboard,
  source,
  isAdmin = false,
  adminEmail,
  viewState = "ready",
}: DashboardShellProps) {
  const realtime = useWorkspaceRealtime(initialDashboard, { enabled: source === "database" });
  const [workspace, setWorkspace] = useState(realtime.data);
  const canAdmin = isAdmin && source === "database" && !workspace.jiraLinked;
  const supabase = useMemo(() => canAdmin ? createClient() : null, [canAdmin]);
  const workspaceRef = useRef(workspace);
  const authoritativeRef = useRef(realtime.data);
  const mutationBusyRef = useRef(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [mutationNotice, setMutationNotice] = useState<{
    message: string;
    retry?: () => void;
  } | null>(null);
  const closeProject = useCallback(() => setSelectedProjectId(null), []);

  useEffect(() => {
    authoritativeRef.current = realtime.data;
    if (mutationBusyRef.current) return;
    workspaceRef.current = realtime.data;
    setWorkspace(realtime.data);
  }, [realtime.data]);

  const retryIntentRef = useRef<(intent: RetryIntent) => Promise<void>>(
    async () => undefined,
  );
  const commitAuthoritative = useCallback((dashboard: DashboardViewModel) => {
    authoritativeRef.current = dashboard;
    workspaceRef.current = dashboard;
    setWorkspace(dashboard);
  }, []);

  const perform = useCallback(async (operation: OptimisticOperation) => {
    if (mutationBusyRef.current) {
      throw new Error("Another change is still saving. Wait for it to finish.");
    }
    mutationBusyRef.current = true;
    const previous = workspaceRef.current;
    const optimistic = operation.apply(previous);
    workspaceRef.current = optimistic;
    setWorkspace(optimistic);
    setMutationNotice(null);
    let mutationError: unknown = null;
    try {
      await operation.execute();
    } catch (error) {
      mutationError = error;
      // Never roll back to the snapshot captured before the request. Realtime may
      // have delivered a newer authoritative view while the optimistic write ran.
      workspaceRef.current = authoritativeRef.current;
      setWorkspace(authoritativeRef.current);
    }

    let refreshError: unknown = null;
    try {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
    } catch (error) {
      refreshError = error;
      commitAuthoritative(authoritativeRef.current);
    } finally {
      mutationBusyRef.current = false;
    }

    if (mutationError) {
      const message = mutationError instanceof Error
        ? mutationError.message
        : "The change could not be saved.";
      const isConflict = mutationError instanceof WorkItemMutationError
        && mutationError.code === WORK_ITEM_CONFLICT_CODE;
      setMutationNotice({
        message,
        ...(!isConflict ? {
          retry: () => {
            setMutationNotice(null);
            void retryIntentRef.current(operation.retryIntent);
          },
        } : {}),
      });
      throw mutationError;
    }

    if (refreshError) {
      const message = refreshError instanceof Error
        ? refreshError.message
        : "The dashboard could not refresh.";
      setMutationNotice({
        message: `Saved, but the dashboard could not refresh: ${message}`,
        retry: () => {
          setMutationNotice(null);
          void realtime.refetch()
            .then(commitAuthoritative)
            .catch((error) => {
              setMutationNotice({
                message: error instanceof Error
                  ? error.message
                  : "The dashboard could not refresh.",
              });
            });
        },
      });
    }
  }, [commitAuthoritative, realtime]);

  const runIntent = useCallback(async (
    intent: RetryIntent,
    base = workspaceRef.current,
  ) => {
    if (!supabase) throw new Error("Administrator access is required.");

    if (intent.kind === "create") {
      const siblings = intent.parentId
        ? base.projects.find((project) => project.id === intent.parentId)?.subtasks
        : base.projects;
      if (!siblings) throw new Error("The selected parent project no longer exists.");
      if (findItem(base, intent.itemId)) return;
      const created = optimisticItem(
        intent.itemId,
        intent.value,
        base,
        siblings.length,
      );
      const payload = buildWorkItemPayload(
        base.id,
        intent.parentId,
        intent.value,
        siblings.length,
        intent.itemId,
      );
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          if (findItem(dashboard, intent.itemId)) return dashboard;
          if (intent.parentId) {
            return withProjects(dashboard, dashboard.projects.map((project) =>
              project.id === intent.parentId
                ? { ...project, subtasks: [...project.subtasks, created] }
                : project));
          }
          return withProjects(dashboard, [...dashboard.projects, { ...created, subtasks: [] }]);
        },
        execute: () => createWorkItem(supabase, payload),
      });
      return;
    }

    if (intent.kind === "update") {
      const currentItem = findItem(base, intent.itemId);
      if (!currentItem) throw new Error("The work item no longer exists.");
      const updated = optimisticItem(
        intent.itemId,
        intent.value,
        base,
        currentItem.sortOrder,
        currentItem.comments,
        currentItem.updatedAt,
      );
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          return withProjects(dashboard, dashboard.projects.map((project) => {
            if (project.id === intent.itemId) return { ...project, ...updated };
            if (project.id !== intent.parentId) return project;
            return {
              ...project,
              subtasks: project.subtasks.map((subtask) =>
                subtask.id === intent.itemId ? updated : subtask),
            };
          }));
        },
        execute: () => updateWorkItem(
          supabase,
          base.id,
          intent.itemId,
          intent.expectedUpdatedAt,
          intent.value,
        ),
      });
      return;
    }

    if (intent.kind === "delete") {
      if (!findItem(base, intent.itemId)) return;
      await perform({
        retryIntent: intent,
        apply(dashboard) {
          return intent.parentId
            ? withProjects(dashboard, dashboard.projects.map((project) =>
                project.id === intent.parentId
                  ? {
                      ...project,
                      subtasks: project.subtasks.filter(
                        (subtask) => subtask.id !== intent.itemId,
                      ),
                    }
                  : project))
            : withProjects(
                dashboard,
                dashboard.projects.filter((project) => project.id !== intent.itemId),
              );
        },
        execute: () => deleteWorkItem(
          supabase,
          base.id,
          intent.itemId,
          intent.expectedUpdatedAt,
        ),
      });
      return;
    }

    const siblings = intent.parentId
      ? base.projects.find((project) => project.id === intent.parentId)?.subtasks
      : base.projects;
    if (!siblings) throw new Error("The sibling list no longer exists.");
    const index = siblings.findIndex((item) => item.id === intent.itemId);
    const target = index + intent.direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const normalized = reordered.map((item, sortOrder) => ({ ...item, sortOrder }));
    const orderedIds = normalized.map((item) => item.id);
    await perform({
      retryIntent: intent,
      apply(dashboard) {
        return intent.parentId
          ? withProjects(dashboard, dashboard.projects.map((project) =>
              project.id === intent.parentId ? { ...project, subtasks: normalized } : project))
          : withProjects(dashboard, normalized as DashboardProject[]);
      },
      execute: () => reorderWorkItems(supabase, base.id, intent.parentId, orderedIds),
    });
  }, [perform, supabase]);

  const retryIntent = useCallback(async (intent: RetryIntent) => {
    try {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
      if (intent.kind === "create" && findItem(authoritative, intent.itemId)) {
        setMutationNotice(null);
        setEditor(null);
        return;
      }
      if (intent.kind === "delete" && !findItem(authoritative, intent.itemId)) {
        setMutationNotice(null);
        return;
      }
      await runIntent(intent, authoritative);
      setMutationNotice(null);
      if (intent.kind === "create" || intent.kind === "update") setEditor(null);
    } catch (error) {
      if (mutationBusyRef.current) return;
      setMutationNotice({
        message: error instanceof Error ? error.message : "Retry failed.",
        retry: () => void retryIntentRef.current(intent),
      });
    }
  }, [commitAuthoritative, realtime, runIntent]);

  useEffect(() => {
    retryIntentRef.current = retryIntent;
  }, [retryIntent]);

  const submitEditor = useCallback(async (value: WorkItemFormValue) => {
    if (!editor || !supabase) throw new Error("Administrator access is required.");
    try {
      await runIntent(editor.item ? {
        kind: "update",
        itemId: editor.item.id,
        parentId: editor.parentId,
        expectedUpdatedAt: editor.item.updatedAt,
        value,
      } : {
        kind: "create",
        itemId: newItemId(),
        parentId: editor.parentId,
        value,
      });
      setEditor(null);
    } catch (error) {
      if (error instanceof WorkItemMutationError && error.code === WORK_ITEM_CONFLICT_CODE) {
        setEditor(null);
      }
      throw error;
    }
  }, [editor, runIntent, supabase]);

  const removeItem = useCallback((item: DashboardWorkItem, parentId: string | null) => {
    if (!supabase) return;
    const noun = parentId ? "subtask" : "project";
    if (!window.confirm(`Delete ${noun} "${item.title}"? This cannot be undone.`)) return;
    void runIntent({
      kind: "delete",
      itemId: item.id,
      parentId,
      expectedUpdatedAt: item.updatedAt,
    }).catch(() => undefined);
  }, [runIntent, supabase]);

  const moveItem = useCallback((
    itemId: string,
    parentId: string | null,
    direction: -1 | 1,
  ) => {
    if (!supabase) return;
    void runIntent({
      kind: "reorder",
      itemId,
      parentId,
      direction,
    }).catch(() => undefined);
  }, [runIntent, supabase]);

  const mapComment = useCallback((row: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
    updated_at: string;
  }): DashboardComment => ({
    id: row.id,
    author: row.author_name,
    text: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }), []);

  const commentControls = canAdmin && supabase ? {
    onCreate: async (itemId: string, id: string, input: CommentInput) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      const row = await createComment(supabase, itemId, input, id);
      return mapComment(row);
    },
    onUpdate: async (
      itemId: string,
      comment: DashboardComment,
      input: CommentInput,
    ) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      const row = await updateComment(
        supabase,
        itemId,
        comment.id,
        comment.updatedAt,
        input,
      );
      return mapComment(row);
    },
    onDelete: async (itemId: string, comment: DashboardComment) => {
      if (!findItem(workspaceRef.current, itemId)) {
        throw new Error("The work item no longer exists in this workspace.");
      }
      await deleteComment(supabase, itemId, comment.id, comment.updatedAt);
    },
    onRefresh: async (itemId: string) => {
      const authoritative = await realtime.refetch();
      commitAuthoritative(authoritative);
      const item = findItem(authoritative, itemId);
      return item?.comments ?? [];
    },
  } : undefined;

  const selectedProject = useMemo(
    () => workspace.projects.find((project) => project.id === selectedProjectId) ?? null,
    [selectedProjectId, workspace.projects],
  );
  const effectiveFilter =
    activeFilter === "all" || workspace.statuses.some((status) => status.id === activeFilter)
      ? activeFilter
      : "all";

  const visibleProjects = useMemo(
    () =>
      effectiveFilter === "all"
        ? workspace.projects
        : workspace.projects.filter((project) => project.statusId === effectiveFilter),
    [effectiveFilter, workspace.projects],
  );

  return (
    <>
      <main className="dashboard">
        <header className="dashboard-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">O</span>
            <div>
              <p className="eyebrow">Delivery workspace</p>
              <h1>{workspace.name}</h1>
              <p className="workspace-description">{workspace.description}</p>
            </div>
          </div>
          <div className="header-tools">
            {isAdmin && source === "database" ? (
              <>
                {canAdmin ? (
                  <>
                    <Link
                      className="secondary-button settings-link"
                      href={`/${workspace.slug}/history`}
                    >
                      History
                    </Link>
                    <Link
                      className="secondary-button settings-link"
                      href={`/${workspace.slug}/settings/statuses`}
                    >
                      Status Settings
                    </Link>
                  </>
                ) : null}
                {adminEmail ? (
                  <SessionControls email={adminEmail} returnTo={`/${workspace.slug}`} />
                ) : null}
              </>
            ) : null}
            <WorkspaceSwitcher activeSlug={workspace.slug} />
            <div
              className="live-indicator"
              data-connection={realtime.fixture ? "fixture" : realtime.connection}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {realtime.fixture ? "Local/test fixture" : connectionLabels[realtime.connection]}
            </div>
          </div>
        </header>

        {workspace.jiraLinked ? (
          <p className="jira-banner" role="status">
            This workspace mirrors Jira. Tasks, statuses, and progress update automatically from your
            connected Jira instance.
            {workspace.lastJiraSyncAt
              ? ` Last sync: ${new Date(workspace.lastJiraSyncAt).toLocaleString()}.`
              : ""}
            {workspace.lastJiraSyncError ? ` Sync warning: ${workspace.lastJiraSyncError}` : ""}
          </p>
        ) : null}

        <KpiGrid kpis={workspace.kpis} />

        <section className="projects-section" aria-labelledby="projects-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2 id="projects-title">Projects</h2>
            </div>
            <div className="section-actions">
              <p>{visibleProjects.length} visible</p>
              {canAdmin ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setEditor({ kind: "project", parentId: null })}
                >
                  New Project
                </button>
              ) : null}
            </div>
          </div>
          {realtime.error ? (
            <p className="realtime-warning" role="alert">
              {realtime.error}. Displayed data may be stale.
            </p>
          ) : null}
          {mutationNotice ? (
            <div className="mutation-notice" role="alert">
              <span>{mutationNotice.message}</span>
              {mutationNotice.retry ? (
                <button type="button" onClick={mutationNotice.retry}>Retry</button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setMutationNotice(null)}
              >
                x
              </button>
            </div>
          ) : null}
          {viewState === "ready" ? (
            <>
              <StatusFilters
                activeFilter={effectiveFilter}
                statuses={workspace.statuses}
                onChange={setActiveFilter}
              />
              {visibleProjects.length ? (
                <div className="projects-grid">
                  {visibleProjects.map((project) => {
                    const projectIndex = workspace.projects.findIndex(
                      (candidate) => candidate.id === project.id,
                    );
                    return (
                    <ProjectCard
                      project={project}
                      key={project.id}
                      onOpen={(selected) => setSelectedProjectId(selected.id)}
                      adminControls={canAdmin ? {
                        onEdit: () => setEditor({
                          kind: "project",
                          parentId: null,
                          item: project,
                        }),
                        onDelete: () => removeItem(project, null),
                        onMoveUp: () => moveItem(project.id, null, -1),
                        onMoveDown: () => moveItem(project.id, null, 1),
                        canMoveUp: projectIndex > 0,
                        canMoveDown: projectIndex < workspace.projects.length - 1,
                      } : undefined}
                    />
                    );
                  })}
                </div>
              ) : (
                <EmptyState />
              )}
            </>
          ) : viewState === "loading" ? (
            <LoadingState />
          ) : (
            <ErrorState />
          )}
        </section>

        <footer>
          <p>Focused delivery, clearly presented.</p>
        </footer>
      </main>
      {editor ? (
        <EditorDialog
          editor={editor}
          dashboard={workspace}
          onSubmit={submitEditor}
          onClose={() => setEditor(null)}
          retryNotice={mutationNotice}
        />
      ) : selectedProject ? (
        <ProjectDetailsModal
          project={selectedProject}
          onClose={closeProject}
          adminControls={canAdmin ? {
            onEditProject: () => setEditor({
              kind: "project",
              parentId: null,
              item: selectedProject,
            }),
            onDeleteProject: () => removeItem(selectedProject, null),
            onAddSubtask: () => setEditor({
              kind: "subtask",
              parentId: selectedProject.id,
            }),
            onEditSubtask: (subtaskId) => {
              const subtask = selectedProject.subtasks.find((item) => item.id === subtaskId);
              if (subtask) {
                setEditor({
                  kind: "subtask",
                  parentId: selectedProject.id,
                  item: subtask,
                });
              }
            },
            onDeleteSubtask: (subtaskId) => {
              const subtask = selectedProject.subtasks.find((item) => item.id === subtaskId);
              if (subtask) removeItem(subtask, selectedProject.id);
            },
            onMoveSubtask: (subtaskId, direction) =>
              moveItem(subtaskId, selectedProject.id, direction),
          } : undefined}
          commentControls={commentControls}
        />
      ) : null}
    </>
  );
}
