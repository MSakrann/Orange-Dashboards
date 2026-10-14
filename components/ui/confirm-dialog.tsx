"use client";

import { ModalDialog } from "@/components/ui/modal-dialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      labelledBy="confirm-dialog-title"
      closeLabel="Close confirmation"
      onClose={onCancel}
      className="confirm-modal"
    >
      <p className="eyebrow">Confirm</p>
      <h2 id="confirm-dialog-title">{title}</h2>
      <p className="confirm-dialog-message">{message}</p>
      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="primary-button delete-confirm-button"
          onClick={onConfirm}
          disabled={busy}
          data-modal-initial-focus
        >
          {confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}
