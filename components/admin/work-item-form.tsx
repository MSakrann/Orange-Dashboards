"use client";

import { useRef, useState, type FormEvent } from "react";
import type { ProjectPriority } from "@/data/workspaces";
import type {
  DashboardStatus,
  DashboardWorkItem,
  OpsHealthStatus,
} from "@/lib/data/dashboard";

export interface WorkItemDraftFields {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: string;
  startDate: string;
  endDate: string;
  lastWeekStatus: string;
  currentStatus: string;
  assignee: string;
  releaseTag: string;
}

export interface WorkItemFormValue {
  title: string;
  description: string;
  statusId: string;
  priority: ProjectPriority;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  lastWeekStatus: OpsHealthStatus | null;
  currentStatus: OpsHealthStatus | null;
  assignee: string | null;
  releaseTag: string | null;
}

export type WorkItemFormErrors = Partial<Record<keyof WorkItemDraftFields, string>>;

const OPS_HEALTH_OPTIONS: OpsHealthStatus[] = ["Clear", "Delayed"];

function asOpsHealthStatus(value: string): OpsHealthStatus | null {
  return value === "Clear" || value === "Delayed" ? value : null;
}

export function validateWorkItemDraft(
  fields: WorkItemDraftFields,
  scheduleMode: "dates" | "ops-health" = "dates",
  options: { requireProgress?: boolean } = {},
): WorkItemFormErrors {
  const requireProgress = options.requireProgress ?? true;
  const errors: WorkItemFormErrors = {};
  if (!fields.title.trim()) errors.title = "Title is required.";
  else if (fields.title.trim().length > 200) errors.title = "Title must be 200 characters or fewer.";
  if (fields.description.trim().length > 10_000) {
    errors.description = "Description must be 10000 characters or fewer.";
  }
  if (fields.assignee.trim().length > 200) {
    errors.assignee = "Assignee must be 200 characters or fewer.";
  }
  if (fields.releaseTag.trim().length > 100) {
    errors.releaseTag = "Release must be 100 characters or fewer.";
  }
  if (!fields.statusId) errors.statusId = "Status is required.";

  const progressText = fields.progress.trim();
  const progress = Number(progressText);
  if (requireProgress) {
    if (!progressText) {
      errors.progress = "Progress is required.";
    } else if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      errors.progress = "Progress must be a whole number from 0 to 100.";
    }
  } else if (
    progressText
    && (!Number.isInteger(progress) || progress < 0 || progress > 100)
  ) {
    errors.progress = "Progress must be a whole number from 0 to 100.";
  }
  if (scheduleMode === "dates") {
    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
      errors.endDate = "End date must be on or after the start date.";
    }
  } else {
    if (fields.lastWeekStatus && !asOpsHealthStatus(fields.lastWeekStatus)) {
      errors.lastWeekStatus = "Choose Clear or Delayed.";
    }
    if (fields.currentStatus && !asOpsHealthStatus(fields.currentStatus)) {
      errors.currentStatus = "Choose Clear or Delayed.";
    }
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
    lastWeekStatus: value?.lastWeekStatus ?? "",
    currentStatus: value?.currentStatus ?? "",
    assignee: value?.owner === "Unassigned" ? "" : value?.owner ?? "",
    releaseTag: value?.releaseTag ?? "",
  };
}

interface WorkItemFormProps {
  kind: "project" | "subtask";
  statuses: DashboardStatus[];
  initialValue?: DashboardWorkItem;
  scheduleMode?: "dates" | "ops-health";
  descriptionLabel?: string;
  assigneeLabel?: string;
  startDateLabel?: string;
  endDateLabel?: string;
  showDescription?: boolean;
  showProgress?: boolean;
  showRelease?: boolean;
  onSubmit: (value: WorkItemFormValue) => Promise<void>;
  onCancel: () => void;
}

export function WorkItemForm({
  kind,
  statuses,
  initialValue,
  scheduleMode = "dates",
  descriptionLabel = "Description",
  assigneeLabel = "Assignee",
  startDateLabel = "Start date",
  endDateLabel = "End date",
  showDescription = true,
  showProgress = true,
  showRelease = false,
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
    const nextErrors = validateWorkItemDraft(fields, scheduleMode, {
      requireProgress: showProgress,
    });
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        title: fields.title.trim(),
        description: showDescription ? fields.description.trim() : fields.description.trim(),
        statusId: fields.statusId,
        priority: fields.priority,
        progress: showProgress ? Number(fields.progress) : Number(fields.progress || 0),
        startDate: scheduleMode === "dates" ? fields.startDate || null : null,
        endDate: scheduleMode === "dates" ? fields.endDate || null : null,
        lastWeekStatus: scheduleMode === "ops-health"
          ? asOpsHealthStatus(fields.lastWeekStatus)
          : null,
        currentStatus: scheduleMode === "ops-health"
          ? asOpsHealthStatus(fields.currentStatus)
          : null,
        assignee: fields.assignee.trim() || null,
        releaseTag: showRelease ? fields.releaseTag.trim() || null : fields.releaseTag.trim() || null,
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

      {showDescription ? (
        <div className="form-field">
          <label htmlFor="work-item-description">{descriptionLabel}</label>
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
      ) : null}

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

      {showProgress ? (
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
      ) : null}

      {scheduleMode === "ops-health" ? (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="work-item-last-week-status">Last Week Status</label>
            <select
              id="work-item-last-week-status"
              value={fields.lastWeekStatus}
              onChange={(event) => setField("lastWeekStatus", event.target.value)}
              aria-invalid={Boolean(errors.lastWeekStatus)}
              aria-describedby={errors.lastWeekStatus ? "work-item-last-week-status-error" : undefined}
            >
              <option value="">Not set</option>
              {OPS_HEALTH_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.lastWeekStatus ? (
              <p className="form-error" id="work-item-last-week-status-error">
                {errors.lastWeekStatus}
              </p>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="work-item-current-status">Current Status</label>
            <select
              id="work-item-current-status"
              value={fields.currentStatus}
              onChange={(event) => setField("currentStatus", event.target.value)}
              aria-invalid={Boolean(errors.currentStatus)}
              aria-describedby={errors.currentStatus ? "work-item-current-status-error" : undefined}
            >
              <option value="">Not set</option>
              {OPS_HEALTH_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.currentStatus ? (
              <p className="form-error" id="work-item-current-status-error">
                {errors.currentStatus}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="work-item-start">{startDateLabel}</label>
            <input
              id="work-item-start"
              type="date"
              value={fields.startDate}
              onChange={(event) => setField("startDate", event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="work-item-end">{endDateLabel}</label>
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
      )}

      <div className="form-field">
        <label htmlFor="work-item-assignee">{assigneeLabel}</label>
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

      {showRelease ? (
        <div className="form-field">
          <label htmlFor="work-item-release">Release</label>
          <input
            id="work-item-release"
            value={fields.releaseTag}
            maxLength={100}
            onChange={(event) => setField("releaseTag", event.target.value)}
            aria-invalid={Boolean(errors.releaseTag)}
            aria-describedby={errors.releaseTag ? "work-item-release-error" : undefined}
            placeholder="e.g. R12, Q3 launch"
          />
          {errors.releaseTag ? (
            <p className="form-error" id="work-item-release-error">{errors.releaseTag}</p>
          ) : null}
        </div>
      ) : null}

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
