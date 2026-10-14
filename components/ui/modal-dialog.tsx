"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
    const blockedRoots = Array.from(
      document.querySelectorAll<HTMLElement>("main.dashboard, main.status-settings"),
    );
    const previousState = blockedRoots.map((root) => ({
      root,
      ariaHidden: root.getAttribute("aria-hidden"),
      wasInert: root.hasAttribute("inert"),
    }));

    for (const root of blockedRoots) {
      root.setAttribute("aria-hidden", "true");
      root.setAttribute("inert", "");
    }
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
      for (const entry of previousState) {
        if (entry.ariaHidden == null) entry.root.removeAttribute("aria-hidden");
        else entry.root.setAttribute("aria-hidden", entry.ariaHidden);
        if (!entry.wasInert) entry.root.removeAttribute("inert");
      }
      queueMicrotask(() => {
        if (previousActiveElement?.isConnected) previousActiveElement.focus();
      });
    };
  }, [onClose]);

  const dialog = (
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

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
