import type { DeptProfile } from "@/data/dept-structure";

export function DeptGlance({ profile }: { profile: DeptProfile }) {
  const stats = [
    { label: "Functions", value: profile.statTeams },
    { label: "Members", value: profile.statMembers },
    { label: "Active projects", value: profile.statActiveProjects },
  ].filter((stat) => stat.value !== null && stat.value !== undefined);

  if (stats.length === 0) return null;

  return (
    <section className="dept-section dept-glance" aria-labelledby="dept-glance-heading">
      <div className="dept-section-inner">
        <h2 id="dept-glance-heading">At a glance</h2>
        <p className="dept-section-lead">A quick read on the department footprint.</p>
        <ul className={`dept-glance-grid count-${stats.length}`}>
          {stats.map((stat) => (
            <li key={stat.label}>
              <p className="dept-glance-value">{stat.value}</p>
              <p className="dept-glance-label">{stat.label}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
