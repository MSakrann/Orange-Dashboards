"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardComment } from "@/lib/data/dashboard";
import {
  CommentMutationError,
  validateCommentInput,
  type CommentInput,
} from "@/lib/data/comment-mutations";

interface CommentSectionProps {
  itemId: string;
  label: string;
  comments: DashboardComment[];
  admin?: boolean;
  onCreate?: (id: string, input: CommentInput) => Promise<DashboardComment | void>;
  onUpdate?: (comment: DashboardComment, input: CommentInput) => Promise<DashboardComment | void>;
  onDelete?: (comment: DashboardComment) => Promise<void>;
  onRefresh?: () => Promise<DashboardComment[]>;
}

type CommentIntent =
  | { kind: "create"; id: string; input: CommentInput }
  | { kind: "update"; comment: DashboardComment; input: CommentInput }
  | { kind: "delete"; comment: DashboardComment };

function newCommentId() {
  return globalThis.crypto.randomUUID();
}

function applyIntent(comments: DashboardComment[], intent: CommentIntent): DashboardComment[] {
  if (intent.kind === "create") {
    if (comments.some((comment) => comment.id === intent.id)) return comments;
    return [...comments, {
      id: intent.id,
      author: intent.input.authorName,
      text: intent.input.body,
      createdAt: "",
      updatedAt: "",
    }];
  }
  if (intent.kind === "update") {
    return comments.map((comment) => comment.id === intent.comment.id
      ? { ...comment, author: intent.input.authorName, text: intent.input.body }
      : comment);
  }
  return comments.filter((comment) => comment.id !== intent.comment.id);
}

function intentApplied(comments: DashboardComment[], intent: CommentIntent) {
  const current = comments.find((comment) =>
    comment.id === (intent.kind === "create" ? intent.id : intent.comment.id));
  if (intent.kind === "create") return Boolean(current);
  if (intent.kind === "delete") return !current;
  return current?.author === intent.input.authorName && current.text === intent.input.body;
}

function CommentForm({
  label,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: CommentInput;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: CommentInput) => void;
  onCancel: () => void;
}) {
  const [authorName, setAuthorName] = useState(initial?.authorName ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="comment-form"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        try {
          const value = validateCommentInput({ authorName, body });
          setError(null);
          onSubmit(value);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Invalid comment.");
        }
      }}
    >
      <label className="form-field">
        <span>Author</span>
        <input
          aria-label="Author"
          value={authorName}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setAuthorName(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Comment</span>
        <textarea
          aria-label="Comment"
          value={body}
          maxLength={10_000}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Saving" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function CommentSection({
  label,
  comments,
  admin = false,
  onCreate,
  onUpdate,
  onDelete,
  onRefresh,
}: CommentSectionProps) {
  const [visible, setVisible] = useState(comments);
  const [mode, setMode] = useState<"closed" | "create" | string>("closed");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    retry?: () => void;
    retryLabel?: string;
  } | null>(null);
  const busyRef = useRef(false);
  const visibleRef = useRef(comments);
  const queuedPropsRef = useRef<DashboardComment[] | null>(null);

  const show = (next: DashboardComment[]) => {
    visibleRef.current = next;
    setVisible(next);
  };

  const acceptAuthoritative = (next: DashboardComment[]) => {
    queuedPropsRef.current = null;
    show(next);
  };

  useEffect(() => {
    if (busyRef.current) {
      queuedPropsRef.current = comments;
    } else {
      visibleRef.current = comments;
      setVisible(comments);
    }
  }, [comments]);

  const refreshOnly = async () => {
    if (!onRefresh) return;
    try {
      acceptAuthoritative(await onRefresh());
      setNotice(null);
    } catch (error) {
      setNotice({
        message: `Saved, but comments could not refresh: ${
          error instanceof Error ? error.message : "Refresh failed."
        }`,
        retry: () => void refreshOnly(),
        retryLabel: "Retry refresh",
      });
    }
  };

  const execute = async (intent: CommentIntent, refetchFirst = false) => {
    if (busyRef.current) return;
    const previous = visibleRef.current;
    busyRef.current = true;
    setBusy(true);
    show(applyIntent(previous, intent));
    setNotice(null);
    let committed = false;

    try {
      if (refetchFirst && onRefresh) {
        const fresh = await onRefresh();
        acceptAuthoritative(fresh);
        if (intentApplied(fresh, intent)) {
          committed = true;
        }
      }

      if (!committed) {
        let saved: DashboardComment | void = undefined;
        if (intent.kind === "create") saved = await onCreate?.(intent.id, intent.input);
        if (intent.kind === "update") saved = await onUpdate?.(intent.comment, intent.input);
        if (intent.kind === "delete") await onDelete?.(intent.comment);
        committed = true;
        if (saved) {
          show(visibleRef.current.map((comment) =>
            comment.id === (intent.kind === "create" ? intent.id : intent.comment.id)
              ? saved
              : comment));
        }
      }
    } catch (mutationError) {
      let fresh: DashboardComment[] | null = null;
      try {
        fresh = onRefresh ? await onRefresh() : null;
      } catch {
        // The queued prop snapshot is the newest fallback available.
      }
      if (fresh) acceptAuthoritative(fresh);
      if (mutationError instanceof CommentMutationError && mutationError.stale) {
        if (!fresh) show(queuedPropsRef.current ?? previous);
        queuedPropsRef.current = null;
        setMode("closed");
        setNotice({
          message:
            "This comment changed elsewhere. Review the refreshed value, then edit or confirm deletion again.",
        });
      } else if (fresh && intentApplied(fresh, intent)) {
        committed = true;
      } else {
        show(fresh ?? queuedPropsRef.current ?? previous);
        setNotice({
          message: mutationError instanceof Error
            ? mutationError.message
            : "The comment change failed.",
          retry: () => void execute(intent, true),
        });
      }
    }

    if (committed) {
      setMode("closed");
      const queued = queuedPropsRef.current;
      try {
        if (onRefresh) {
          acceptAuthoritative(await onRefresh());
        } else if (queued) {
          show(applyIntent(queued, intent));
        }
        setNotice(null);
      } catch (error) {
        if (queued) show(applyIntent(queued, intent));
        setNotice({
          message: `Saved, but comments could not refresh: ${
            error instanceof Error ? error.message : "Refresh failed."
          }`,
          retry: () => void refreshOnly(),
          retryLabel: "Retry refresh",
        });
      }
    }

    queuedPropsRef.current = null;
    busyRef.current = false;
    setBusy(false);
  };

  const create = (input: CommentInput) => {
    if (!onCreate) return;
    void execute({ kind: "create", id: newCommentId(), input });
  };

  const update = (comment: DashboardComment, input: CommentInput) => {
    if (!onUpdate) return;
    void execute({ kind: "update", comment, input });
  };

  const remove = (comment: DashboardComment) => {
    if (!onDelete) return;
    if (!window.confirm(`Delete comment by ${comment.author}? This cannot be undone.`)) return;
    void execute({ kind: "delete", comment });
  };

  return (
    <section className="comments" aria-label={label}>
      <div className="comment-heading">
        <h3>{label}</h3>
        {admin && mode === "closed" ? (
          <button type="button" className="secondary-button" onClick={() => setMode("create")}>
            Add comment
          </button>
        ) : null}
      </div>
      {notice ? (
        <div className="mutation-notice" role="alert">
          <span>{notice.message}</span>
          {notice.retry ? (
            <button type="button" onClick={notice.retry}>
              {notice.retryLabel ?? "Retry"}
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === "create" ? (
        <CommentForm
          label="New comment"
          busy={busy}
          submitLabel="Post comment"
          onSubmit={create}
          onCancel={() => setMode("closed")}
        />
      ) : null}
      {visible.length ? visible.map((comment) => (
        <article className="comment-entry" key={comment.id}>
          {mode === comment.id ? (
            <CommentForm
              label="Edit comment"
              initial={{ authorName: comment.author, body: comment.text }}
              busy={busy}
              submitLabel="Save comment"
              onSubmit={(input) => update(comment, input)}
              onCancel={() => setMode("closed")}
            />
          ) : (
            <>
              <blockquote>
                <p>{comment.text}</p>
                <cite>{comment.author}</cite>
              </blockquote>
              {admin ? (
                <div className="admin-actions">
                  <button type="button" onClick={() => setMode(comment.id)}>
                    Edit comment by {comment.author}
                  </button>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={`Delete comment by ${comment.author}`}
                    onClick={() => remove(comment)}
                  >
                    x
                  </button>
                </div>
              ) : null}
            </>
          )}
        </article>
      )) : <p>No comments yet.</p>}
    </section>
  );
}
