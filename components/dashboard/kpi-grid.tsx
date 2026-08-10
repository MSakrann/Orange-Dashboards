import type { DashboardKpis, DashboardProject, DashboardStatus } from "@/lib/data/dashboard";
import type { StatusFilter } from "@/components/dashboard/status-filters";

interface StatusMetricMode {
  statuses: DashboardStatus[];
  projects: DashboardProject[];
  activeFilter: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
}

interface KpiGridProps {
  kpis: DashboardKpis;
  statusMetrics?: StatusMetricMode;
}

export function KpiGrid({ kpis, statusMetrics }: KpiGridProps) {
  if (statusMetrics) {
    const { statuses, projects, activeFilter, onSelect } = statusMetrics;
    const metrics = [
      {
        value: "all" as StatusFilter,
        label: "All Projects",
        count: projects.length,
        color: "var(--orange)",
        meta: "Across this workspace",
      },
      ...statuses.map((status) => ({
        value: status.id as StatusFilter,
        label: status.name,
        count: projects.filter((project) => project.statusId === status.id).length,
        color: status.color,
        meta: "Matching this status",
      })),
    ];

    return (
      <section
        className="kpi-grid kpi-grid-status"
        aria-label="Workspace status overview"
      >
        {metrics.map((metric) => {
          const active = activeFilter === metric.value;
          return (
            <button
              type="button"
              className="kpi-card kpi-card-button"
              data-active={active}
              aria-pressed={active}
              key={metric.value}
              style={{ ["--kpi-accent" as string]: metric.color }}
              onClick={() => onSelect(metric.value)}
            >
              <p className="kpi-label">{metric.label}</p>
              <p className="kpi-value">{metric.count}</p>
              <p className="kpi-meta">{metric.meta}</p>
            </button>
          );
        })}
      </section>
    );
  }

  const metrics = [
    { label: "Total projects", value: kpis.total, meta: "Across this workspace" },
    { label: "Active", value: kpis.active, meta: "Active reporting categories" },
    { label: "Needs attention", value: kpis.needsAttention, meta: "Risk or delayed categories" },
    { label: "Completed", value: kpis.completed, meta: `${kpis.averageProgress}% average progress` },
  ];

  return (
    <section className="kpi-grid" aria-label="Workspace overview">
      {metrics.map((metric) => (
        <article className="kpi-card" key={metric.label}>
          <p className="kpi-label">{metric.label}</p>
          <p className="kpi-value">{metric.value}</p>
          <p className="kpi-meta">{metric.meta}</p>
        </article>
      ))}
    </section>
  );
}
