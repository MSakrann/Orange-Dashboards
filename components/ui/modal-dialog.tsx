"use client";

import { useEffect, useRef, type ReactNode } from "react";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalDialogProps {
  labelledBy: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function ModalDialog({
  labelledBy,
  closeLabel,
  onClose,
  children,
  className = "",
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const dashboard = document.querySelector<HTMLElement>(".dashboard");
    const previousAriaHidden = dashboard?.getAttribute("aria-hidden");
    const wasInert = dashboard?.hasAttribute("inert") ?? false;

    dashboard?.setAttribute("aria-hidden", "true");
    dashboard?.setAttribute("inert", "");
    const initialFocus = dialogRef.current?.querySelector<HTMLElement>(
      "[data-modal-initial-focus]",
    );
    (initialFocus ?? closeButtonRef.current ?? dialogRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      const focusableElements = Array.from(
        dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

      if (!dialog || !focusableElements.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const focusIsOutside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === firstElement || focusIsOutside)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || focusIsOutside)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (dashboard) {
        if (previousAriaHidden == null) dashboard.removeAttribute("aria-hidden");
        else dashboard.setAttribute("aria-hidden", previousAriaHidden);
        if (!wasInert) dashboard.removeAttribute("inert");
      }
      queueMicrotask(() => {
        if (previousActiveElement?.isConnected) previousActiveElement.focus();
      });
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
      >
        <button
          className="modal-close"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          ref={closeButtonRef}
        >
          x
        </button>
        {children}
      </section>
    </div>
  );
}
