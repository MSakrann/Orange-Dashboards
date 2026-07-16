import Link from "next/link";
import {
  HISTORY_ACTIONS,
  HISTORY_ENTITY_TYPES,
  type HistoryActorOption,
  type HistoryFilters as HistoryFilterValues,
} from "@/lib/data/history";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function HistoryFilters({
  filters,
  historyPath,
  actors,
}: {
  filters: HistoryFilterValues;
  historyPath: string;
  actors: HistoryActorOption[];
}) {
  return (
    <form action={historyPath} className="history-filters" method="get">
      <label>
        Actor
        <select defaultValue={filters.actor} name="actor">
          <option value="">All actors</option>
          {actors.map((actor) => (
            <option key={actor.actorId} value={actor.actorId}>
              {actor.displayName}{actor.email ? ` (${actor.email})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Action
        <select defaultValue={filters.action} name="action">
          <option value="">All actions</option>
          {HISTORY_ACTIONS.map((action) => (
            <option key={action} value={action}>{label(action)}</option>
          ))}
        </select>
      </label>
      <label>
        Entity type
        <select defaultValue={filters.entityType} name="entity">
          <option value="">All entity types</option>
          {HISTORY_ENTITY_TYPES.map((entity) => (
            <option key={entity} value={entity}>{label(entity)}</option>
          ))}
        </select>
      </label>
      <label>
        From
        <input defaultValue={filters.from} name="from" type="date" />
      </label>
      <label>
        To
        <input defaultValue={filters.to} name="to" type="date" />
      </label>
      <div className="history-filter-actions">
        <button type="submit">Apply filters</button>
        <Link href={historyPath}>Clear</Link>
      </div>
    </form>
  );
}
