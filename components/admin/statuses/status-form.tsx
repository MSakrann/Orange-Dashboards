"use client";

import { useState } from "react";
import type { DashboardStatus, ReportingCategory } from "@/lib/data/dashboard";
import {
  validateStatusInput,
  type StatusInput,
} from "@/lib/data/status-mutations";

export function StatusForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: DashboardStatus;
  busy: boolean;
  onSubmit: (input: StatusInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#e56f18");
  const [reportingCategory, setReportingCategory] = useState<ReportingCategory>(
    initial?.reportingCategory ?? "active",
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="status-form"
      aria-label={initial ? `Edit ${initial.name}` : "New status"}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        try {
          onSubmit(validateStatusInput({ name, color, reportingCategory }));
          setError(null);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Invalid status.");
        }
      }}
    >
      <label className="form-field">
        <span>Status name</span>
        <input
          aria-label="Status name"
          value={name}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Color</span>
        <input
          aria-label="Status color"
          value={color}
          disabled={busy}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Reporting category</span>
        <select
          aria-label="Reporting category"
          value={reportingCategory}
          disabled={busy}
          onChange={(event) => setReportingCategory(event.target.value as ReportingCategory)}
        >
          <option value="active">Active</option>
          <option value="risk">Risk</option>
          <option value="delayed">Delayed</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Saving" : initial ? "Save status" : "Create status"}
        </button>
      </div>
    </form>
  );
}
