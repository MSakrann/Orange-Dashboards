"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceRealtime } from "@/hooks/use-workspace-realtime";
import type { DashboardStatus, DashboardViewModel } from "@/lib/data/dashboard";
import {
  createStatus,
  deleteStatus,
  reorderStatuses,
  StatusMutationError,
  updateStatus,
  type StatusInput,
} from "@/lib/data/status-mutations";
import { createClient } from "@/lib/supabase/client";
import { StatusForm } from "./status-form";

type Editor = "new" | DashboardStatus | null;
type StatusIntent =
  | { kind: "create"; id: string; input: StatusInput }
  | { kind: "update"; status: DashboardStatus; input: StatusInput }
  | { kind: "reorder"; orderedIds: string[] }
  | { kind: "delete"; status: DashboardStatus; replacementId: string };

function applyIntent(statuses: DashboardStatus[], intent: StatusIntent): DashboardStatus[] {
  if (intent.kind === "create") {
    if (statuses.some((status) => status.id === intent.id)) return statuses;
    return [...statuses, {
      id: intent.id,
      name: intent.input.name,
      color: intent.input.color,
      reportingCategory: intent.input.reportingCategory,
      sortOrder: statuses.length,
      updatedAt: "",
    }];
  }
  if (intent.kind === "update") {
    return statuses.map((status) => status.id === intent.status.id
      ? {
          ...status,
          name: intent.input.name,
          color: intent.input.color,
          reportingCategory: intent.input.reportingCategory,
        }
      : status);
  }
  if (intent.kind === "delete") {
    return statuses
      .filter((status) => status.id !== intent.status.id)
      .map((status, sortOrder) => ({ ...status, sortOrder }));
  }
  const byId = new Map(statuses.map((status) => [status.id, status]));
  return intent.orderedIds
    .map((id) => byId.get(id))
    .filter((status): status is DashboardStatus => Boolean(status))
    .map((status, sortOrder) => ({ ...status, sortOrder }));
}

function intentApplied(statuses: DashboardStatus[], intent: StatusIntent) {
  const current = statuses.find((status) =>
    status.id === (intent.kind === "create" ? intent.id
      : intent.kind === "reorder" ? "" : intent.status.id));
  if (intent.kind === "create") return Boolean(current);
  if (intent.kind === "delete") return !current;
  if (intent.kind === "update") {
    return Boolean(current
      && current.name === intent.input.name
      && current.color.toLowerCase() === intent.input.color.toLowerCase()
      && current.reportingCategory === intent.input.reportingCategory);
  }
  return statuses.map((status) => status.id).join(",") === intent.orderedIds.join(",");
}

export function StatusManager({ initialDashboard }: { initialDashboard: DashboardViewModel }) {
  const realtime = useWorkspaceRealtime(initialDashboard, { enabled: true });
  const supabase = useMemo(() => createClient(), []);
  const [statuses, setStatuses] = useState(realtime.data.statuses);
  const [editor, setEditor] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<DashboardStatus | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    retry?: () => void;
    retryLabel?: string;
  } | null>(null);
  const busyRef = useRef(false);
  const statusesRef = useRef(statuses);
  const queuedStatusesRef = useRef<DashboardStatus[] | null>(null);

  const show = (next: DashboardStatus[]) => {
    statusesRef.current = next;
    setStatuses(next);
  };

  const acceptAuthoritative = (next: DashboardStatus[]) => {
    queuedStatusesRef.current = null;
    show(next);
  };

  useEffect(() => {
    if (busyRef.current) {
      queuedStatusesRef.current = realtime.data.statuses;
    } else {
      statusesRef.current = realtime.data.statuses;
      setStatuses(realtime.data.statuses);
    }
  }, [realtime.data.statuses]);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    realtime.data.projects.forEach((project) => {
      counts.set(project.statusId, (counts.get(project.statusId) ?? 0) + 1);
      project.subtasks.forEach((subtask) => {
        counts.set(subtask.statusId, (counts.get(subtask.statusId) ?? 0) + 1);
      });
    });
    return counts;
  }, [realtime.data.projects]);

  const refreshOnly = async () => {
    try {
      acceptAuthoritative((await realtime.refetch()).statuses);
      setNotice(null);
    } catch (error) {
      setNotice({
        message: `Saved, but statuses could not refresh: ${
          error instanceof Error ? error.message : "Refresh failed."
        }`,
        retry: () => void refreshOnly(),
        retryLabel: "Retry refresh",
      });
    }
  };

  const executeMutation = async (intent: StatusIntent) => {
    if (intent.kind === "create") {
      await createStatus(supabase, initialDashboard.id, intent.id, intent.input);
    } else if (intent.kind === "update") {
      await updateStatus(
        supabase,
        initialDashboard.id,
        intent.status.id,
        intent.status.updatedAt,
        intent.input,
      );
    } else if (intent.kind === "delete") {
      await deleteStatus(
        supabase,
        initialDashboard.id,
        intent.status.id,
        intent.replacementId,
        intent.status.updatedAt,
      );
    } else {
      await reorderStatuses(supabase, initialDashboard.id, intent.orderedIds);
    }
  };

  const run = async (intent: StatusIntent, refetchFirst = false) => {
    if (busyRef.current) return;
    const previous = statusesRef.current;
    busyRef.current = true;
    setBusy(true);
    show(applyIntent(previous, intent));
    setNotice(null);
    let committed = false;

    try {
      if (refetchFirst) {
        const fresh = (await realtime.refetch()).statuses;
        acceptAuthoritative(fresh);
        committed = intentApplied(fresh, intent);
      }
      if (!committed) {
        await executeMutation(intent);
        committed = true;
      }
    } catch (mutationError) {
      let fresh: DashboardStatus[] | null = null;
      try {
        fresh = (await realtime.refetch()).statuses;
        acceptAuthoritative(fresh);
      } catch {
        // Use the queued realtime snapshot or rollback when refresh is unavailable.
      }
      if (mutationError instanceof StatusMutationError && mutationError.conflict) {
        if (!fresh) show(queuedStatusesRef.current ?? previous);
        queuedStatusesRef.current = null;
        setEditor(null);
        setDeleting(null);
        setNotice({
          message:
            "This status changed elsewhere. Review the refreshed value, then edit or confirm deletion again.",
        });
      } else if (fresh && intentApplied(fresh, intent)) {
        committed = true;
      } else {
        show(fresh ?? queuedStatusesRef.current ?? previous);
        setNotice({
          message: mutationError instanceof Error
            ? mutationError.message
            : "The status change failed.",
          retry: () => void run(intent, true),
        });
      }
    }

    if (committed) {
      const queued = queuedStatusesRef.current;
      setEditor(null);
      setDeleting(null);
      try {
        acceptAuthoritative((await realtime.refetch()).statuses);
        setNotice(null);
      } catch (error) {
        if (queued) show(applyIntent(queued, intent));
        setNotice({
          message: `Saved, but statuses could not refresh: ${
            error instanceof Error ? error.message : "Refresh failed."
          }`,
          retry: () => void refreshOnly(),
          retryLabel: "Retry refresh",
        });
      }
    }

    queuedStatusesRef.current = null;
    busyRef.current = false;
    setBusy(false);
  };

  const save = (input: StatusInput) => {
    const duplicate = statuses.some((status) =>
      status.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
      && (editor === "new" || status.id !== editor?.id));
    if (duplicate) {
      setNotice({ message: "A status with this name already exists in the workspace." });
      return;
    }

    if (editor === "new") {
      void run({ kind: "create", id: globalThis.crypto.randomUUID(), input });
      return;
    }

    if (!editor) return;
    void run({ kind: "update", status: editor, input });
  };

  const move = (status: DashboardStatus, direction: -1 | 1) => {
    const index = statuses.findIndex((candidate) => candidate.id === status.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= statuses.length) return;
    const reordered = [...statuses];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void run({ kind: "reorder", orderedIds: reordered.map((entry) => entry.id) });
  };

  const confirmDelete = () => {
    if (!deleting || !replacementId) {
      setNotice({ message: "Select a replacement status." });
      return;
    }
    if (!window.confirm(
      `Delete "${deleting.name}" and move its items to the selected replacement?`,
    )) return;
    void run({ kind: "delete", status: deleting, replacementId });
  };

  return (
    <main className="status-settings">
      <header className="settings-header">
        <div>
          <p className="eyebrow">Workspace administration</p>
          <h1>Status settings</h1>
          <p>Manage reporting labels for {initialDashboard.name}.</p>
        </div>
        <nav aria-label="Admin navigation">
          <a href={`/${initialDashboard.slug}`}>Back to workspace</a>
          <a href={`/${initialDashboard.slug}/history`}>History</a>
        </nav>
      </header>
      {notice ? (
        <div className="mutation-notice" role="alert">
          <span>{notice.message}</span>
          {notice.retry ? (
            <button type="button" onClick={notice.retry}>
              {notice.retryLabel ?? "Retry"}
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss error" onClick={() => setNotice(null)}>x</button>
        </div>
      ) : null}
      <div className="settings-toolbar">
        <span>{statuses.length} statuses</span>
        <button type="button" className="primary-button" onClick={() => setEditor("new")}>
          New status
        </button>
      </div>
      {editor ? (
        <StatusForm
          initial={editor === "new" ? undefined : editor}
          busy={busy}
          onSubmit={save}
          onCancel={() => setEditor(null)}
        />
      ) : null}
      <ol className="status-list">
        {statuses.map((status, index) => {
          const count = usage.get(status.id) ?? 0;
          return (
            <li key={status.id}>
              <span
                className="status-swatch"
                style={{ backgroundColor: status.color }}
                aria-hidden="true"
              />
              <div>
                <strong>{status.name}</strong>
                <small>{status.reportingCategory} · {count} {count === 1 ? "item" : "items"}</small>
              </div>
              <div className="admin-actions">
                <button type="button" onClick={() => setEditor(status)}>Edit {status.name}</button>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => move(status, -1)}
                >
                  Move {status.name} up
                </button>
                <button
                  type="button"
                  disabled={busy || index === statuses.length - 1}
                  onClick={() => move(status, 1)}
                >
                  Move {status.name} down
                </button>
                <button
                  type="button"
                  className="delete-button"
                  disabled={busy || statuses.length === 1}
                  onClick={() => {
                    setDeleting(status);
                    setReplacementId("");
                  }}
                >
                  Delete {status.name}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {deleting ? (
        <section className="delete-status-panel" aria-label={`Delete ${deleting.name}`}>
          <h2>Delete {deleting.name}</h2>
          <p>
            This status is used by {usage.get(deleting.id) ?? 0} items. Select a same-workspace
            replacement before deleting it.
          </p>
          <label className="form-field">
            <span>Replacement status</span>
            <select
              aria-label="Replacement status"
              value={replacementId}
              onChange={(event) => setReplacementId(event.target.value)}
            >
              <option value="">Select replacement</option>
              {statuses.filter((status) => status.id !== deleting.id).map((status) => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button type="button" className="primary-button" disabled={busy} onClick={confirmDelete}>
              Confirm delete
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
