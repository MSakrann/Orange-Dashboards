import type { DashboardProject, DashboardWorkItem } from "@/lib/data/dashboard";
import { ProgressBar } from "@/components/ui/progress-bar";

interface ProjectCardProps {
  project: DashboardProject;
  onOpen: (project: DashboardProject) => void;
  showInlineDetails?: boolean;
  showChildHierarchy?: boolean;
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

function JiraKey({ item }: { item: DashboardWorkItem }) {
  if (!item.jiraIssueKey) return null;
  return (
    <span className="jira-key">
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
  showInlineDetails = false,
  showChildHierarchy = false,
  adminControls,
}: ProjectCardProps) {
  const childCount = project.subtasks.length;

  return (
    <article className="project-card">
      <div className="project-heading">
        <div>
          <div className="project-meta-row">
            <p className="status-badge">
              <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
              {project.statusName}
            </p>
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
