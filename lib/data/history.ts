import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_ACTIONS = ["insert", "update", "delete"] as const;
export const HISTORY_ENTITY_TYPES = ["workspace", "status", "work_item", "comment"] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export interface HistoryFilters {
  actor: string;
  action: HistoryAction | "";
  entityType: HistoryEntityType | "";
  from: string;
  to: string;
  page: number;
  snapshotAt: string;
}

export interface HistoryEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  workspaceId: string | null;
  workspaceSlug: string | null;
  workspaceName: string | null;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  oldValues: Json | null;
  newValues: Json | null;
  createdAt: string;
}

export interface HistoryPageData {
  entries: HistoryEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  snapshotAt: string;
}

export function historyAccessRedirect(
  access: { envConfigured: boolean; authenticated: boolean; admin: boolean },
  paths: { workspacePath: string; historyPath: string },
): string | null {
  if (!access.envConfigured) return paths.workspacePath;
  if (!access.authenticated) {
    return `/login?next=${encodeURIComponent(paths.historyPath)}`;
  }
  return access.admin ? null : paths.workspacePath;
}

type SearchValue = string | string[] | undefined;
type SearchInput = Record<string, SearchValue> | URLSearchParams;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(input: SearchInput, key: string): string {
  if (input instanceof URLSearchParams) return input.get(key) ?? "";
  const value = input[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: string): boolean {
  return value.length <= 64
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && validDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

export function parseHistoryFilters(input: SearchInput): HistoryFilters {
  const actorValue = firstValue(input, "actor").trim();
  const actionValue = firstValue(input, "action");
  const entityValue = firstValue(input, "entity");
  const fromValue = firstValue(input, "from");
  const toValue = firstValue(input, "to");
  const pageValue = Number(firstValue(input, "page"));
  const snapshotValue = firstValue(input, "snapshot");

  let from = validDate(fromValue) ? fromValue : "";
  let to = validDate(toValue) ? toValue : "";
  if (from && to) {
    const days = (
      Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)
    ) / 86_400_000;
    if (days < 0 || days > 366) {
      from = "";
      to = "";
    }
  }

  return {
    actor: uuidPattern.test(actorValue) ? actorValue.toLowerCase() : "",
    action: HISTORY_ACTIONS.includes(actionValue as HistoryAction)
      ? actionValue as HistoryAction
      : "",
    entityType: HISTORY_ENTITY_TYPES.includes(entityValue as HistoryEntityType)
      ? entityValue as HistoryEntityType
      : "",
    from,
    to,
    page: Number.isSafeInteger(pageValue) && pageValue >= 1 && pageValue <= 10000
      ? pageValue
      : 1,
    snapshotAt: validTimestamp(snapshotValue) ? snapshotValue : "",
  };
}

export function buildHistorySearchParams(filters: HistoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entity", filters.entityType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.snapshotAt) params.set("snapshot", filters.snapshotAt);
  return params;
}

type JsonObject = Record<string, Json | undefined>;

function asObject(value: Json | null): JsonObject {
  return value
      && typeof value === "object"
      && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ? value as JsonObject
    : {};
}

function sameValue(left: Json | undefined, right: Json | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function displayValue(value: Json | undefined): string {
  if (value === null || value === undefined || value === "") return "None";
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "Unreadable value";
  }
  return text.length > 157 ? `${text.slice(0, 157)}…` : text;
}

const hiddenFields = new Set(["id", "workspace_id", "created_at", "updated_at"]);

export interface HistoryChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export function formatHistoryChanges(entry: HistoryEntry): HistoryChange[] {
  const oldValues = asObject(entry.oldValues);
  const newValues = asObject(entry.newValues);
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((field) => !hiddenFields.has(field))
    .filter((field) => !sameValue(oldValues[field], newValues[field]))
    .sort()
    .map((field) => ({
      field: field.length > 80 ? `${field.slice(0, 79)}…` : field,
      oldValue: displayValue(oldValues[field]),
      newValue: displayValue(newValues[field]),
    }));
}

export class HistoryDataError extends Error {
  constructor(message = "Unable to read history data.") {
    super(message);
    this.name = "HistoryDataError";
  }
}

type HistoryRpcRow =
  Database["public"]["Functions"]["query_activity_history"]["Returns"][number];

function invalid(message: string): never {
  throw new HistoryDataError(`Invalid history ${message}.`);
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) invalid(`${field} UUID`);
  return value;
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredUuid(value, field);
}

const oversizedMarker = "[Oversized value truncated] ";

function boundedNullableString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maxLength || value.includes("\0")) {
    invalid(field);
  }
  return value;
}

function legacyBoundedNullableString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.includes("\0")) invalid(field);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${oversizedMarker}${trimmed.slice(0, maxLength - oversizedMarker.length)}`;
}

const unsafeJsonKeys = new Set(["__proto__", "prototype", "constructor"]);

function sanitizeHistoryJson(value: unknown, field: string, depth = 0): Json {
  if (depth > 12) invalid(`${field} JSON`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${field} JSON`);
    return value;
  }
  if (typeof value === "string") {
    if (value.includes("\0")) invalid(`${field} JSON`);
    return value.length > 20_000
      ? `${oversizedMarker}${value.slice(0, 10_000)}`
      : value;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) invalid(`${field} JSON`);
    return value.map((item) => sanitizeHistoryJson(item, field, depth + 1));
  }
  if (typeof value !== "object") invalid(`${field} JSON`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(`${field} JSON`);
  const entries = Object.entries(value);
  if (entries.length > 500) invalid(`${field} JSON`);
  const sanitized: Record<string, Json> = Object.create(null);
  for (const [key, item] of entries) {
    if (key.length > 200 || unsafeJsonKeys.has(key)) invalid(`${field} JSON`);
    sanitized[key] = sanitizeHistoryJson(item, field, depth + 1);
  }
  return sanitized;
}

function historyObject(value: unknown, field: string): JsonObject | null {
  if (value === null) return null;
  if (Array.isArray(value) || typeof value !== "object") {
    invalid(`${field} JSON`);
  }
  return sanitizeHistoryJson(value, field) as JsonObject;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !validTimestamp(value)) invalid(`${field} timestamp`);
  return value;
}

function parseHistoryRpcRow(value: unknown): {
  entry: HistoryEntry;
  totalCount: number;
  snapshotAt: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("row");
  const row = value as Record<string, unknown>;
  if (!HISTORY_ACTIONS.includes(row.action as HistoryAction)) invalid("action");
  if (!HISTORY_ENTITY_TYPES.includes(row.entity_type as HistoryEntityType)) {
    invalid("entity type");
  }
  if (!Number.isSafeInteger(row.total_count) || (row.total_count as number) < 0) {
    invalid("total count");
  }
  const actorId = nullableUuid(row.actor_id, "actor");
  const actorEmail = legacyBoundedNullableString(row.actor_email, "actor email", 320);
  const actorDisplayName = legacyBoundedNullableString(
    row.actor_display_name,
    "actor display name",
    200,
  );
  if (!actorId && (actorEmail || actorDisplayName)) invalid("actor attribution");
  return {
    entry: {
      id: requiredUuid(row.id, "id"),
      actorId,
      actorName: legacyBoundedNullableString(row.actor_name, "actor name", 200),
      actorEmail,
      actorDisplayName,
      workspaceId: nullableUuid(row.workspace_id, "workspace"),
      workspaceSlug: boundedNullableString(row.workspace_slug, "workspace slug", 100),
      workspaceName: boundedNullableString(row.workspace_name, "workspace name", 200),
      action: row.action as HistoryAction,
      entityType: row.entity_type as HistoryEntityType,
      entityId: nullableUuid(row.entity_id, "entity"),
      oldValues: historyObject(row.old_values, "old values"),
      newValues: historyObject(row.new_values, "new values"),
      createdAt: timestamp(row.created_at, "created"),
    },
    totalCount: row.total_count as number,
    snapshotAt: timestamp(row.snapshot_at, "snapshot"),
  };
}

export function parseHistoryRpcRows(value: unknown): {
  entries: HistoryEntry[];
  totalCount: number;
  snapshotAt: string;
} {
  if (!Array.isArray(value)) invalid("response");
  if (!value.length) return { entries: [], totalCount: 0, snapshotAt: "" };
  const parsed = value.map(parseHistoryRpcRow);
  const { totalCount, snapshotAt } = parsed[0];
  if (parsed.some((row) => row.totalCount !== totalCount)) invalid("total count");
  if (parsed.some((row) => row.snapshotAt !== snapshotAt)) invalid("snapshot timestamp");
  return {
    entries: parsed.map((row) => row.entry),
    totalCount,
    snapshotAt,
  };
}

export function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Invalid timestamp";
  try {
    return `${new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date)} UTC`;
  } catch {
    return "Invalid timestamp";
  }
}

export interface HistoryWorkspaceIdentity {
  workspaceId: string;
  slug: string;
  name: string;
  isDeleted: boolean;
}

export interface HistoryActorOption {
  actorId: string;
  displayName: string;
  email: string | null;
}

export function parseHistoryActorRows(value: unknown): HistoryActorOption[] {
  if (!Array.isArray(value) || value.length > 500) invalid("actor response");
  const seen = new Set<string>();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      invalid("actor row");
    }
    const row = candidate as Record<string, unknown>;
    const actorId = requiredUuid(row.actor_id, "actor");
    const parsedDisplayName = legacyBoundedNullableString(
      row.display_name,
      "actor display name",
      200,
    );
    const email = legacyBoundedNullableString(row.email, "actor email", 320);
    if (seen.has(actorId)) invalid("actor row");
    seen.add(actorId);
    return { actorId, displayName: parsedDisplayName ?? email ?? actorId, email };
  });
}

export async function loadHistoryActors(
  supabase: SupabaseClient<Database>,
  workspaceSlug: string,
): Promise<HistoryActorOption[]> {
  const { data, error } = await supabase.rpc("list_history_actors", {
    p_workspace_slug: workspaceSlug,
  });
  if (error) throw new HistoryDataError("Unable to load history actors.");
  return parseHistoryActorRows(data ?? []);
}

type HistoryWorkspaceRpcRow =
  Database["public"]["Functions"]["resolve_history_workspace"]["Returns"][number];

export async function resolveHistoryWorkspace(
  supabase: SupabaseClient<Database>,
  workspaceSlug: string,
): Promise<HistoryWorkspaceIdentity | null> {
  const { data, error } = await supabase.rpc("resolve_history_workspace", {
    p_workspace_slug: workspaceSlug,
  });
  if (error) throw new HistoryDataError("Unable to resolve history workspace.");

  const typedRows: HistoryWorkspaceRpcRow[] = data ?? [];
  if (typedRows.length === 0) return null;
  if (typedRows.length !== 1) invalid("workspace identity response");
  const row = typedRows[0] as Record<string, unknown>;
  const slug = boundedNullableString(row.slug, "workspace slug", 100);
  const name = boundedNullableString(row.name, "workspace name", 200);
  if (!slug
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      || slug !== workspaceSlug) {
    invalid("workspace slug");
  }
  if (!name || typeof row.is_deleted !== "boolean") invalid("workspace identity");
  return {
    workspaceId: requiredUuid(row.workspace_id, "workspace"),
    slug,
    name,
    isDeleted: row.is_deleted,
  };
}

export async function loadHistory(
  supabase: SupabaseClient<Database>,
  workspaceSlug: string,
  filters: HistoryFilters,
): Promise<HistoryPageData> {
  const { data, error } = await supabase.rpc("query_activity_history", {
    p_workspace_slug: workspaceSlug,
    p_snapshot_at: filters.snapshotAt || null,
    p_actor_id: filters.actor || null,
    p_action: filters.action || null,
    p_entity_type: filters.entityType || null,
    p_from_date: filters.from || null,
    p_to_date: filters.to || null,
    p_page: filters.page,
    p_page_size: HISTORY_PAGE_SIZE,
  });
  if (error) throw new HistoryDataError("Unable to load history.");

  const typedRows: HistoryRpcRow[] = data ?? [];
  const parsed = parseHistoryRpcRows(typedRows);
  if (!parsed.entries.length && filters.page > 1) {
    return loadHistory(supabase, workspaceSlug, { ...filters, page: 1 });
  }
  return {
    entries: parsed.entries,
    totalCount: parsed.totalCount,
    page: filters.page,
    pageSize: HISTORY_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(parsed.totalCount / HISTORY_PAGE_SIZE)),
    snapshotAt: parsed.snapshotAt || filters.snapshotAt,
  };
}
