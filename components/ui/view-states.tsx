interface ViewStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading projects" }: ViewStateProps) {
  return (
    <div className="view-state" role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ message = "No projects found" }: ViewStateProps) {
  return (
    <div className="view-state">
      <p className="view-state-title">{message}</p>
      <p>Try another status filter or workspace.</p>
    </div>
  );
}

export function ErrorState({ message = "Unable to load projects" }: ViewStateProps) {
  return (
    <div className="view-state view-state-error" role="alert">
      <p className="view-state-title">{message}</p>
      <p>Please refresh the page and try again.</p>
    </div>
  );
}
