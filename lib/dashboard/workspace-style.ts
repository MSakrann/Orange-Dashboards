/** Manual Digital-style delivery workspaces (shared card/form chrome). */
export function isDigitalStyleWorkspace(slug: string): boolean {
  return slug === "digital" || slug === "data-lake";
}

/** Workspaces that use per-team status + start/end dates instead of project dates. */
export function usesTeamTracks(slug: string): boolean {
  return slug === "data-lake";
}
