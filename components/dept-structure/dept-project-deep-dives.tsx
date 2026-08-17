"use client";

import { useState } from "react";
import type { DeptProject, DeptTeam } from "@/data/dept-structure";

function formatDate(value: string | null) {
  if (!value) return "—";
  return value;
}

export function DeptProjectDeepDives({
  projects,
  teams,
}: {
  projects: DeptProject[];
  teams: DeptTeam[];
}) {
  const detailed = projects.filter(
    (project) =>
      project.ownerName ||
      project.startDate ||
      project.endDate ||
      project.milestones.length > 0 ||
      project.progressPct > 0,
  );
  const [openId, setOpenId] = useState<string | null>(detailed[0]?.id ?? null);

  if (detailed.length === 0) return null;

  const teamName = (id: string | null) =>
    id ? teams.find((team) => team.id === id)?.name ?? "—" : "—";

  return (
    <section className="dept-section dept-deep-dives" aria-labelledby="dept-deep-dives-heading">
      <div className="dept-section-inner">
        <h2 id="dept-deep-dives-heading">Project deep-dives</h2>
        <p className="dept-section-lead">Owners, dates, progress, and milestones.</p>

        <ul className="dept-deep-list">
          {detailed.map((project) => {
            const open = openId === project.id;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  className="dept-deep-toggle"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : project.id)}
                >
                  <span>{project.title}</span>
                  <span className="dept-deep-toggle-meta">
                    {project.progressPct}% · {project.statusLabel || "—"}
                  </span>
                </button>
                {open ? (
                  <div className="dept-deep-panel">
                    <p>{project.summary || "—"}</p>
                    <dl className="dept-deep-facts">
                      <div>
                        <dt>Team</dt>
                        <dd>{teamName(project.teamId)}</dd>
                      </div>
                      <div>
                        <dt>Owner</dt>
                        <dd>{project.ownerName || "—"}</dd>
                      </div>
                      <div>
                        <dt>Dates</dt>
                        <dd>
                          {formatDate(project.startDate)} → {formatDate(project.endDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Progress</dt>
                        <dd>
                          <div className="dept-progress" aria-hidden="true">
                            <span style={{ width: `${project.progressPct}%` }} />
                          </div>
                          <span>{project.progressPct}%</span>
                        </dd>
                      </div>
                    </dl>
                    {project.milestones.length > 0 ? (
                      <div>
                        <h4>Milestones</h4>
                        <ul className="dept-milestone-list">
                          {project.milestones.map((milestone) => (
                            <li key={milestone.id} data-done={milestone.isDone ? "true" : "false"}>
                              <span>{milestone.title}</span>
                              <span>{formatDate(milestone.dueDate)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
