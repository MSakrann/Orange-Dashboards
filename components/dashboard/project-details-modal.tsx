import type { DashboardComment, DashboardProject } from "@/lib/data/dashboard";
import type { CommentInput } from "@/lib/data/comment-mutations";
import { CommentSection } from "@/components/admin/comments/comment-section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModalDialog } from "@/components/ui/modal-dialog";

interface ProjectDetailsModalProps {
  project: DashboardProject;
  onClose: () => void;
  adminControls?: {
    onEditProject: () => void;
    onDeleteProject: () => void;
    onAddSubtask: () => void;
    onEditSubtask: (subtaskId: string) => void;
    onDeleteSubtask: (subtaskId: string) => void;
    onMoveSubtask: (subtaskId: string, direction: -1 | 1) => void;
  };
  commentControls?: {
    onCreate: (
      itemId: string,
      id: string,
      input: CommentInput,
    ) => Promise<DashboardComment | void>;
    onUpdate: (
      itemId: string,
      comment: DashboardComment,
      input: CommentInput,
    ) => Promise<DashboardComment | void>;
    onDelete: (itemId: string, comment: DashboardComment) => Promise<void>;
    onRefresh: (itemId: string) => Promise<DashboardComment[]>;
  };
}

export function ProjectDetailsModal({
  project,
  onClose,
  adminControls,
  commentControls,
}: ProjectDetailsModalProps) {
  return (
    <ModalDialog
      labelledBy={`project-title-${project.id}`}
      closeLabel="Close project details"
      onClose={onClose}
    >
        <p className="status-badge">
          <span aria-hidden="true" style={{ backgroundColor: project.statusColor }} />
          {project.statusName}
        </p>
        <h2 id={`project-title-${project.id}`}>{project.title}</h2>
        <p className="modal-description">{project.description}</p>
        <ProgressBar label={`${project.title} progress`} value={project.progress} />
        <dl className="modal-meta">
          <div>
            <dt>Owner</dt>
            <dd>{project.owner}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{project.priority}</dd>
          </div>
        </dl>
        {adminControls ? (
          <div className="admin-actions project-admin-actions">
            <button type="button" onClick={adminControls.onEditProject}>
              Edit {project.title}
            </button>
            <button type="button" onClick={adminControls.onAddSubtask}>
              Add subtask
            </button>
            <button
              type="button"
              className="delete-button"
              aria-label={`Delete ${project.title}`}
              onClick={adminControls.onDeleteProject}
            >
              x
            </button>
          </div>
        ) : null}
        <section className="subtasks" aria-labelledby={`subtasks-title-${project.id}`}>
          <h3 id={`subtasks-title-${project.id}`}>Subtasks</h3>
          {project.subtasks.length ? (
            <ul>
              {project.subtasks.map((subtask, index) => (
                <li key={subtask.id}>
                  <div>
                    <strong>{subtask.title}</strong>
                    <small>{subtask.statusName} · {subtask.progress}%</small>
                  </div>
                  {adminControls ? (
                    <div className="admin-actions">
                      <button
                        type="button"
                        onClick={() => adminControls.onEditSubtask(subtask.id)}
                      >
                        Edit {subtask.title}
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => adminControls.onMoveSubtask(subtask.id, -1)}
                      >
                        Move {subtask.title} up
                      </button>
                      <button
                        type="button"
                        disabled={index === project.subtasks.length - 1}
                        onClick={() => adminControls.onMoveSubtask(subtask.id, 1)}
                      >
                        Move {subtask.title} down
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={`Delete ${subtask.title}`}
                        onClick={() => adminControls.onDeleteSubtask(subtask.id)}
                      >
                        x
                      </button>
                    </div>
                  ) : null}
                  <CommentSection
                    itemId={subtask.id}
                    label={`${subtask.title} comments`}
                    comments={subtask.comments}
                    admin={Boolean(commentControls)}
                    onCreate={commentControls
                      ? (id, input) => commentControls.onCreate(subtask.id, id, input)
                      : undefined}
                    onUpdate={commentControls
                      ? (comment, input) => commentControls.onUpdate(subtask.id, comment, input)
                      : undefined}
                    onDelete={commentControls
                      ? (comment) => commentControls.onDelete(subtask.id, comment)
                      : undefined}
                    onRefresh={commentControls
                      ? () => commentControls.onRefresh(subtask.id)
                      : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p>No subtasks yet.</p>
          )}
        </section>
        <CommentSection
          itemId={project.id}
          label="Project comments"
          comments={project.comments}
          admin={Boolean(commentControls)}
          onCreate={commentControls
            ? (id, input) => commentControls.onCreate(project.id, id, input)
            : undefined}
          onUpdate={commentControls
            ? (comment, input) => commentControls.onUpdate(project.id, comment, input)
            : undefined}
          onDelete={commentControls
            ? (comment) => commentControls.onDelete(project.id, comment)
            : undefined}
          onRefresh={commentControls
            ? () => commentControls.onRefresh(project.id)
            : undefined}
        />
    </ModalDialog>
  );
}
