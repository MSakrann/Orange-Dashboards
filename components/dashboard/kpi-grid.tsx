import type { DashboardKpis } from "@/lib/data/dashboard";

interface KpiGridProps {
  kpis: DashboardKpis;
}

export function KpiGrid({ kpis }: KpiGridProps) {
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
