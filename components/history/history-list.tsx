import {
  formatHistoryChanges,
  formatHistoryTimestamp,
  type HistoryEntry,
} from "@/lib/data/history";

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function actorLabel(entry: HistoryEntry) {
  if (!entry.actorId) return "System";
  if (entry.actorDisplayName && entry.actorEmail) {
    return `${entry.actorDisplayName} (${entry.actorEmail})`;
  }
  return entry.actorDisplayName ?? entry.actorEmail ?? entry.actorName ?? entry.actorId;
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) {
    return <p className="history-empty">No history matches these filters.</p>;
  }

  return (
    <ol className="history-list">
      {entries.map((entry) => {
        const changes = formatHistoryChanges(entry);
        return (
          <li className="history-entry" key={entry.id}>
            <header>
              <div>
                <strong>{actorLabel(entry)}</strong>
                <span> {titleCase(entry.action)} {titleCase(entry.entityType)}</span>
              </div>
              <time dateTime={entry.createdAt}>
                {formatHistoryTimestamp(entry.createdAt)}
              </time>
            </header>
            <p className="history-entity-id">
              Entity {entry.entityId ?? "no longer available"}
            </p>
            {changes.length ? (
              <dl className="history-changes">
                {changes.map((change) => (
                  <div key={change.field}>
                    <dt>{titleCase(change.field)}</dt>
                    <dd>
                      <span className="history-old">{change.oldValue}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="history-new">{change.newValue}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No field details were recorded.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
