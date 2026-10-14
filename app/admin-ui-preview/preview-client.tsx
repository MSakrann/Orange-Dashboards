"use client";

import { useMemo, useState, type DragEvent } from "react";
import { getWorkspace } from "@/data/workspaces";
import { mapFixtureWorkspace } from "@/lib/data/initial-dashboard";
import type { DashboardProject, DashboardStatus } from "@/lib/data/dashboard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { BrandMark } from "@/components/ui/brand-mark";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { ProjectCard } from "@/components/dashboard/project-card";
import type { StatusFilter } from "@/components/dashboard/status-filters";

export function AdminUiPreview() {
  const initial = useMemo(() => {
    const workspace = getWorkspace("hot-topics");
    if (!workspace) throw new Error("Missing hot-topics fixture");
    const dashboard = mapFixtureWorkspace(workspace);
    return {
      ...dashboard,
      projects: dashboard.projects.slice(0, 3).map((project, index) => ({
        ...project,
        sortOrder: index,
        subtasks: [],
      })),
    };
  }, []);
  const [projects, setProjects] = useState<DashboardProject[]>(initial.projects);
  const [statuses, setStatuses] = useState<DashboardStatus[]>(initial.statuses);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [manageKpisOpen, setManageKpisOpen] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");

  function reorder(sourceId: string, beforeId: string) {
    setProjects((current) => {
      const moving = current.find((project) => project.id === sourceId);
      if (!moving || sourceId === beforeId) return current;
      const without = current.filter((project) => project.id !== sourceId);
      const beforeIndex = without.findIndex((project) => project.id === beforeId);
      if (beforeIndex < 0) return current;
      return [
        ...without.slice(0, beforeIndex),
        moving,
        ...without.slice(beforeIndex),
      ].map((project, sortOrder) => ({ ...project, sortOrder }));
    });
  }

  return (
    <>
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <p className="eyebrow">Admin UI preview</p>
          <div className="brand-title-row">
            <BrandMark />
            <h1>{initial.name}</h1>
          </div>
          <p className="workspace-description">
            Local preview of admin editing controls (drag-drop, delete confirm, multi-delete, KPIs).
          </p>
        </div>
        <div className="header-tools">
          <button
            className="secondary-button settings-link"
            type="button"
            onClick={() => setManageKpisOpen(true)}
          >
            Manage KPIs
          </button>
        </div>
      </header>

      <KpiGrid
        statuses={statuses}
        projects={projects}
        activeFilter={activeFilter}
        onSelect={setActiveFilter}
      />

      <section className="projects-section" aria-labelledby="projects-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2 id="projects-title">Projects</h2>
          </div>
          <div className="section-actions">
            <p>{projects.length} visible</p>
            {selectedIds.size ? (
              <>
                <p>{selectedIds.size} selected</p>
                <button
                  className="primary-button delete-confirm-button"
                  type="button"
                  onClick={() => setPendingDeleteIds([...selectedIds])}
                >
                  Delete selected
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => undefined}
              showDetailsButton={false}
              selected={selectedIds.has(project.id)}
              onSelectedChange={(selected) => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (selected) next.add(project.id);
                  else next.delete(project.id);
                  return next;
                });
              }}
              dragControls={{
                onDragStart: (event: DragEvent<HTMLElement>) => {
                  setDragId(project.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", project.id);
                },
                onDragOver: (event: DragEvent<HTMLElement>) => {
                  event.preventDefault();
                  setDropTargetId(project.id);
                },
                onDragLeave: () => {
                  setDropTargetId((current) => (current === project.id ? null : current));
                },
                onDrop: (event: DragEvent<HTMLElement>) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain") || dragId;
                  setDropTargetId(null);
                  setDragId(null);
                  if (sourceId) reorder(sourceId, project.id);
                },
                onDragEnd: () => {
                  setDragId(null);
                  setDropTargetId(null);
                },
                isDragging: dragId === project.id,
                isDropTarget: dropTargetId === project.id,
              }}
              adminControls={{
                onEdit: () => undefined,
                onDelete: () => setPendingDeleteIds([project.id]),
              }}
            />
          ))}
        </div>
      </section>
    </main>

      {pendingDeleteIds ? (
        <ConfirmDialog
          title={
            pendingDeleteIds.length === 1
              ? `Delete ${projects.find((project) => project.id === pendingDeleteIds[0])?.title ?? "project"}?`
              : `Delete ${pendingDeleteIds.length} projects?`
          }
          message={
            pendingDeleteIds.length === 1
              ? `Delete project "${projects.find((project) => project.id === pendingDeleteIds[0])?.title}"? This cannot be undone.`
              : `Delete ${pendingDeleteIds.length} selected projects? This cannot be undone.`
          }
          onConfirm={() => {
            setProjects((current) =>
              current.filter((project) => !pendingDeleteIds.includes(project.id)));
            setSelectedIds(new Set());
            setPendingDeleteIds(null);
          }}
          onCancel={() => setPendingDeleteIds(null)}
        />
      ) : null}

      {manageKpisOpen ? (
        <ModalDialog
          labelledBy="manage-kpis-title"
          closeLabel="Close KPI manager"
          onClose={() => setManageKpisOpen(false)}
          className="admin-modal kpi-manager-modal"
        >
          <p className="eyebrow">Administration</p>
          <h2 id="manage-kpis-title">Manage KPIs</h2>
          <p className="status-panel-intro">
            Rename, add, or remove KPI status cards for {initial.name}.
          </p>
          <div className="settings-toolbar">
            <span>{statuses.length} statuses</span>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const id = globalThis.crypto.randomUUID();
                setStatuses((current) => [
                  ...current,
                  {
                    id,
                    name: `New status ${current.length + 1}`,
                    color: "#e56f18",
                    reportingCategory: "active",
                    sortOrder: current.length,
                    updatedAt: "",
                  },
                ]);
                setEditingStatusId(id);
                setDraftName(`New status ${statuses.length + 1}`);
              }}
            >
              New status
            </button>
          </div>
          <ol className="status-list">
            {statuses.map((status) => (
              <li key={status.id}>
                <span
                  className="status-swatch"
                  style={{ backgroundColor: status.color }}
                  aria-hidden="true"
                />
                <div>
                  {editingStatusId === status.id ? (
                    <label className="form-field">
                      <span>Status name</span>
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        aria-label={`Rename ${status.name}`}
                      />
                    </label>
                  ) : (
                    <strong>{status.name}</strong>
                  )}
                </div>
                <div className="admin-actions">
                  {editingStatusId === status.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        const name = draftName.trim();
                        if (!name) return;
                        setStatuses((current) =>
                          current.map((entry) =>
                            entry.id === status.id ? { ...entry, name } : entry));
                        setEditingStatusId(null);
                      }}
                    >
                      Save {status.name}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStatusId(status.id);
                        setDraftName(status.name);
                      }}
                    >
                      Edit {status.name}
                    </button>
                  )}
                  <button
                    type="button"
                    className="delete-button"
                    disabled={statuses.length === 1}
                    onClick={() => {
                      setStatuses((current) => current.filter((entry) => entry.id !== status.id));
                    }}
                  >
                    Delete {status.name}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </ModalDialog>
      ) : null}
    </>
  );
}
