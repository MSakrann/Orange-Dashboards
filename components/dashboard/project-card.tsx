import type { KeyboardEvent, MouseEvent } from "react";
import type {
  DashboardProject,
  DashboardWorkItem,
  OpsHealthStatus,
} from "@/lib/data/dashboard";
import { ProgressBar } from "@/components/ui/progress-bar";

interface ProjectCardProps {
  project: DashboardProject;
  onOpen: (project: DashboardProject) => void;
  showOwner?: boolean;
  ownerRoleLabel?: string;
  showProgress?: boolean;
  showDetailsButton?: boolean;
  showDescription?: boolean;
  descriptionLabel?: string;
  openOnCardClick?: boolean;
  showOverdueTag?: boolean;
  showChildHierarchy?: boolean;
  showReleaseTag?: boolean;
  scheduleMode?: "dates" | "ops-health";
  startDateLabel?: string;
  endDateLabel?: string;
  adminControls?: {
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
  };
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(date?: string) {
  if (!date) return "Not scheduled";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : dateFormatter.format(parsed);
}

function isPastTargetDate(endDate?: string) {
  if (!endDate) return false;
  const target = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return target.getTime() < todayUtc;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatOpsHealthStatus(value?: OpsHealthStatus) {
  return value ?? "Not set";
}

function stopCardActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function JiraKey({ item }: { item: DashboardWorkItem }) {
  if (!item.jiraIssueKey) return null;
  return (
    <span className="jira-key" onClick={stopCardActivation} onKeyDown={stopCardActivation}>
      {item.jiraUrl ? (
        <a href={item.jiraUrl} target="_blank" rel="noreferrer">
          {item.jiraIssueKey}
        </a>
      ) : (
        item.jiraIssueKey
      )}
    </span>
  );
}

export function ProjectCard({
  project,
  onOpen,
  showOwner = true,
  ownerRoleLabel = "Project owner",
  showProgress = true,
  showDetailsButton = true,
  showDescription = false,
  descriptionLabel = "Description",
  openOnCardClick = false,
  showOverdueTag = false,
  showChildHierarchy = false,
  showReleaseTag = false,
  scheduleMode = "dates",
  startDateLabel = "Start",
  endDateLabel = "Target",
  adminControls,
}: ProjectCardProps) {
  const childCount = project.subtasks.length;
  const overdue = showOverdueTag && isPastTargetDate(project.endDate);
  const cardClassName = openOnCardClick ? "project-card project-card-clickable" : "project-card";
  const releaseTag = project.releaseTag?.trim();

  return (
    <article
      className={cardClassName}
      role={openOnCardClick ? "button" : undefined}
      tabIndex={openOnCardClick ? 0 : undefined}
      aria-label={openOnCardClick ? `View ${project.title} details` : undefined}
      onClick={openOnCardClick ? () => onOpen(project) : undefined}
      onKeyDown={
        openOnCardClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(project);
              }
            }
          : undefined
      }
    >
      <div className="project-heading">
        <div>
          <div className="project-meta-row">
            <p className="status-badge">
              <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
              {project.statusName}
            </p>
            {showReleaseTag && releaseTag ? (
              <p className="release-tag" aria-label={`Release ${releaseTag}`}>
                {releaseTag}
              </p>
            ) : null}
            {overdue ? (
              <p className="overdue-badge" aria-label="Target date passed">
                Delayed
              </p>
            ) : null}
            {showChildHierarchy ? (
              <p className="hierarchy-badge" aria-label="Parent work item">
                Parent
                {childCount ? ` · ${childCount} child${childCount === 1 ? "" : "ren"}` : ""}
              </p>
            ) : null}
          </div>
          <h2>
            {project.title}
            <JiraKey item={project} />
          </h2>
        </div>
        <span className={`priority priority-${project.priority}`}>{project.priority}</span>
      </div>

      {showOwner ? (
        <div className="owner">
          <span className="owner-avatar" aria-hidden="true">
            {initials(project.owner)}
          </span>
          <span>
            <strong>{project.owner}</strong>
            <small>
              {ownerRoleLabel !== "Project owner"
                ? ownerRoleLabel
                : (project.ownerRole ?? ownerRoleLabel)}
            </small>
          </span>
        </div>
      ) : null}

      {showDescription && project.description.trim() ? (
        <section
          className="project-card-description"
          aria-label={`${project.title} ${descriptionLabel.toLowerCase()}`}
        >
          <h3>{descriptionLabel}</h3>
          <div className="project-card-description-body">
            <p>{project.description}</p>
          </div>
        </section>
      ) : null}

      {showProgress ? (
        <ProgressBar label={`${project.title} progress`} value={project.progress} />
      ) : null}

      <dl className="project-dates">
        {scheduleMode === "ops-health" ? (
          <>
            <div>
              <dt>Last Week Status</dt>
              <dd data-ops-health={project.lastWeekStatus ?? "unset"}>
                {formatOpsHealthStatus(project.lastWeekStatus)}
              </dd>
            </div>
            <div>
              <dt>Current Status</dt>
              <dd data-ops-health={project.currentStatus ?? "unset"}>
                {formatOpsHealthStatus(project.currentStatus)}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>{startDateLabel}</dt>
              <dd>{formatDate(project.startDate)}</dd>
            </div>
            <div>
              <dt>{endDateLabel}</dt>
              <dd className={overdue ? "project-date-overdue" : undefined}>
                {formatDate(project.endDate)}
              </dd>
            </div>
          </>
        )}
      </dl>

      {showChildHierarchy ? (
        <section
          className="project-card-children"
          aria-label={`${project.title} child work items`}
        >
          <h3>Children</h3>
          {childCount ? (
            <ul>
              {project.subtasks.map((child) => (
                <li key={child.id}>
                  <div className="project-card-child-heading">
                    <span
                      className="status-dot"
                      aria-hidden="true"
                      style={{ backgroundColor: child.statusColor }}
                    />
                    <strong>{child.title}</strong>
                    <JiraKey item={child} />
                  </div>
                  <small>
                    {child.statusName}
                    {" · "}
                    {child.progress}%
                    {child.owner ? ` · ${child.owner}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-card-children-empty">No child work items.</p>
          )}
        </section>
      ) : null}

      {showDetailsButton ? (
        <button className="details-button" type="button" onClick={() => onOpen(project)}>
          View {project.title} details
        </button>
      ) : null}
      {adminControls ? (
        <div
          className="admin-actions"
          aria-label={`${project.title} administration`}
          onClick={stopCardActivation}
          onKeyDown={stopCardActivation}
        >
          <button type="button" onClick={adminControls.onEdit}>
            Edit {project.title}
          </button>
          <button
            type="button"
            onClick={adminControls.onMoveUp}
            disabled={!adminControls.canMoveUp}
          >
            Move {project.title} up
          </button>
          <button
            type="button"
            onClick={adminControls.onMoveDown}
            disabled={!adminControls.canMoveDown}
          >
            Move {project.title} down
          </button>
          <button
            className="delete-button"
            type="button"
            onClick={adminControls.onDelete}
            aria-label={`Delete ${project.title}`}
          >
            x
          </button>
        </div>
      ) : null}
    </article>
  );
}
