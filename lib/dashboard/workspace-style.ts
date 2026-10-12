/** Manual Digital-style delivery workspaces (shared card/form chrome). */
export function isDigitalStyleWorkspace(slug: string): boolean {
  return slug === "digital" || slug === "data-lake" || slug === "reports-and-insights";
}

/** Workspaces that show Action Owner on cards and in the edit form. */
export function usesActionOwner(slug: string): boolean {
  return isDigitalStyleWorkspace(slug) || slug === "pe-delivery";
}

/** Workspaces that use per-team status + start/end dates instead of project dates. */
export function usesTeamTracks(slug: string): boolean {
  return slug === "data-lake" || slug === "reports-and-insights";
}
