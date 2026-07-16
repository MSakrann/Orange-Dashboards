"use client";

import { useRef, useState, type FormEvent } from "react";
import type { ProjectPriority } from "@/data/workspaces";
import type { DashboardStatus, DashboardWorkItem } from "@/lib/data/dashboard";

export interface WorkItemDraftFields {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: string;
  startDate: string;
  endDate: string;
  assignee: string;
}

export interface WorkItemFormValue {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  assignee: string | null;
}

export type WorkItemFormErrors = Partial<Record<keyof WorkItemDraftFields, string>>;

export function validateWorkItemDraft(fields: WorkItemDraftFields): WorkItemFormErrors {
  const errors: WorkItemFormErrors = {};
  if (!fields.title.trim()) errors.title = "Title is required.";
  else if (fields.title.trim().length > 200) errors.title = "Title must be 200 characters or fewer.";
  if (fields.description.trim().length > 10_000) {
    errors.description = "Description must be 10000 characters or fewer.";
  }
  if (fields.assignee.trim().length > 200) {
    errors.assignee = "Assignee must be 200 characters or fewer.";
  }
  if (!fields.statusId) errors.statusId = "Status is required.";

  const progressText = fields.progress.trim();
  const progress = Number(progressText);
  if (!progressText) {
    errors.progress = "Progress is required.";
  } else if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    errors.progress = "Progress must be a whole number from 0 to 100.";
  }
  if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
    errors.endDate = "End date must be on or after the start date.";
  }
  return errors;
}

function initialFields(
  statuses: DashboardStatus[],
  value?: DashboardWorkItem,
): WorkItemDraftFields {
  return {
    title: value?.title ?? "",
    description: value?.description ?? "",
    statusId: value?.statusId ?? statuses[0]?.id ?? "",
    priority: value?.priority ?? "medium",
    progress: String(value?.progress ?? 0),
    startDate: value?.startDate ?? "",
    endDate: value?.endDate ?? "",
    assignee: value?.owner === "Unassigned" ? "" : value?.owner ?? "",
  };
}

interface WorkItemFormProps {
  kind: "project" | "subtask";
  statuses: DashboardStatus[];
  initialValue?: DashboardWorkItem;
  onSubmit: (value: WorkItemFormValue) => Promise<void>;
  onCancel: () => void;
}

export function WorkItemForm({
  kind,
  statuses,
  initialValue,
  onSubmit,
  onCancel,
}: WorkItemFormProps) {
  // The form is intentionally initialized once. Realtime refreshes must not overwrite
  // fields while an administrator is editing them.
  const [fields, setFields] = useState(() => initialFields(statuses, initialValue));
  const [errors, setErrors] = useState<WorkItemFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const noun = kind === "project" ? "project" : "subtask";
  const action = initialValue ? `Save ${noun}` : `Create ${noun}`;

  function setField<Key extends keyof WorkItemDraftFields>(
    key: Key,
    value: WorkItemDraftFields[Key],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const nextErrors = validateWorkItemDraft(fields);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        title: fields.title.trim(),
        description: fields.description.trim(),
        statusId: fields.statusId,
        priority: fields.priority,
        progress: Number(fields.progress),
        startDate: fields.startDate || null,
        endDate: fields.endDate || null,
        assignee: fields.assignee.trim() || null,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save this work item.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="work-item-form" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="work-item-title">Title</label>
        <input
          id="work-item-title"
          value={fields.title}
          maxLength={200}
          onChange={(event) => setField("title", event.target.value)}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "work-item-title-error" : undefined}
          data-modal-initial-focus
        />
        {errors.title ? <p className="form-error" id="work-item-title-error">{errors.title}</p> : null}
      </div>

      <div className="form-field">
        <label htmlFor="work-item-description">Description</label>
        <textarea
          id="work-item-description"
          value={fields.description}
          maxLength={10_000}
          onChange={(event) => setField("description", event.target.value)}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "work-item-description-error" : undefined}
          rows={4}
        />
        {errors.description ? (
          <p className="form-error" id="work-item-description-error">{errors.description}</p>
        ) : null}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="work-item-status">Status</label>
          <select
            id="work-item-status"
            value={fields.statusId}
            onChange={(event) => setField("statusId", event.target.value)}
            aria-invalid={Boolean(errors.statusId)}
            aria-describedby={errors.statusId ? "work-item-status-error" : undefined}
          >
            {!statuses.length ? <option value="">No statuses available</option> : null}
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>{status.name}</option>
            ))}
          </select>
          {errors.statusId ? <p className="form-error" id="work-item-status-error">{errors.statusId}</p> : null}
        </div>
        <div className="form-field">
          <label htmlFor="work-item-priority">Priority</label>
          <select
            id="work-item-priority"
            value={fields.priority}
            onChange={(event) => setField("priority", event.target.value as ProjectPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="work-item-progress">Progress</label>
        <input
          id="work-item-progress"
          type="number"
          min="0"
          max="100"
          step="1"
          value={fields.progress}
          onChange={(event) => setField("progress", event.target.value)}
          aria-invalid={Boolean(errors.progress)}
          aria-describedby={errors.progress ? "work-item-progress-error" : undefined}
        />
        {errors.progress ? <p className="form-error" id="work-item-progress-error">{errors.progress}</p> : null}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="work-item-start">Start date</label>
          <input
            id="work-item-start"
            type="date"
            value={fields.startDate}
            onChange={(event) => setField("startDate", event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="work-item-end">End date</label>
          <input
            id="work-item-end"
            type="date"
            value={fields.endDate}
            onChange={(event) => setField("endDate", event.target.value)}
            aria-invalid={Boolean(errors.endDate)}
            aria-describedby={errors.endDate ? "work-item-end-error" : undefined}
          />
          {errors.endDate ? <p className="form-error" id="work-item-end-error">{errors.endDate}</p> : null}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="work-item-assignee">Assignee</label>
        <input
          id="work-item-assignee"
          value={fields.assignee}
          maxLength={200}
          onChange={(event) => setField("assignee", event.target.value)}
          aria-invalid={Boolean(errors.assignee)}
          aria-describedby={errors.assignee ? "work-item-assignee-error" : undefined}
        />
        {errors.assignee ? (
          <p className="form-error" id="work-item-assignee-error">{errors.assignee}</p>
        ) : null}
      </div>

      {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Saving" : action}
        </button>
      </div>
    </form>
  );
}
