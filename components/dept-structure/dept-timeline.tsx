import type { DeptTimelineItem } from "@/data/dept-structure";

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "—";
}

export function DeptTimeline({ items }: { items: DeptTimelineItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="dept-section dept-timeline" aria-labelledby="dept-timeline-heading">
      <div className="dept-section-inner">
        <h2 id="dept-timeline-heading">Timeline</h2>
        <p className="dept-section-lead">Roadmap moments across the department.</p>
        <ol className="dept-timeline-track">
          {items.map((item) => (
            <li key={item.id}>
              <p className="dept-timeline-status">{item.statusLabel || "—"}</p>
              <h3>{item.label}</h3>
              <p className="dept-timeline-dates">{formatRange(item.startDate, item.endDate)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
