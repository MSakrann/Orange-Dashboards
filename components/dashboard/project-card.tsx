import type { DashboardProject } from "@/lib/data/dashboard";
import { ProgressBar } from "@/components/ui/progress-bar";

interface ProjectCardProps {
  project: DashboardProject;
  onOpen: (project: DashboardProject) => void;
  showInlineDetails?: boolean;
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

const commentDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(date?: string) {
  if (!date) return "Not scheduled";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : dateFormatter.format(parsed);
}

function formatCommentDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : commentDateFormatter.format(parsed);
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

export function ProjectCard({
  project,
  onOpen,
  showInlineDetails = false,
  adminControls,
}: ProjectCardProps) {
  return (
    <article className="project-card">
      <div className="project-heading">
        <div>
          <p className="status-badge">
            <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
            {project.statusName}
          </p>
          <h2>
            {project.title}
            {project.jiraIssueKey ? (
              <span className="jira-key">
                {project.jiraUrl ? (
                  <a href={project.jiraUrl} target="_blank" rel="noreferrer">
                    {project.jiraIssueKey}
                  </a>
                ) : (
                  project.jiraIssueKey
                )}
              </span>
            ) : null}
          </h2>
        </div>
        <span className={`priority priority-${project.priority}`}>{project.priority}</span>
      </div>

      <div className="owner">
        <span className="owner-avatar" aria-hidden="true">
          {initials(project.owner)}
        </span>
        <span>
          <strong>{project.owner}</strong>
          <small>{project.ownerRole ?? "Project owner"}</small>
        </span>
      </div>

      {showInlineDetails && project.description.trim() ? (
        <section className="project-card-description" aria-label={`${project.title} description`}>
          <h3>Description</h3>
          <div className="project-card-description-body">
            <p>{project.description}</p>
          </div>
        </section>
      ) : null}

      <ProgressBar label={`${project.title} progress`} value={project.progress} />

      <dl className="project-dates">
        <div>
          <dt>Start</dt>
          <dd>{formatDate(project.startDate)}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{formatDate(project.endDate)}</dd>
        </div>
      </dl>

      {showInlineDetails ? (
        <section className="project-card-comments" aria-label={`${project.title} comments`}>
          <h3>Comments</h3>
          {project.comments.length ? (
            <ul>
              {project.comments.map((comment) => (
                <li key={comment.id}>
                  <p>{comment.text}</p>
                  <cite>
                    {comment.author}
                    {comment.createdAt ? ` · ${formatCommentDate(comment.createdAt)}` : ""}
                  </cite>
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-card-comments-empty">No comments yet.</p>
          )}
        </section>
      ) : null}

      <button className="details-button" type="button" onClick={() => onOpen(project)}>
        View {project.title} details
      </button>
      {adminControls ? (
        <div className="admin-actions" aria-label={`${project.title} administration`}>
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
