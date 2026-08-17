import type { DeptProject, DeptTeam } from "@/data/dept-structure";

export function DeptHighlighted({
  projects,
  teams,
}: {
  projects: DeptProject[];
  teams: DeptTeam[];
}) {
  if (projects.length === 0) return null;
  const teamName = (id: string | null) =>
    id ? teams.find((team) => team.id === id)?.name ?? "—" : "—";

  return (
    <section className="dept-section dept-highlighted" aria-labelledby="dept-highlighted-heading">
      <div className="dept-section-inner">
        <h2 id="dept-highlighted-heading">Highlighted projects</h2>
        <p className="dept-section-lead">The work getting the most attention right now.</p>
        <ul className={`dept-highlight-strip count-${projects.length}`}>
          {projects.map((project) => (
            <li key={project.id}>
              <h3>{project.title}</h3>
              <p className="dept-highlight-meta">
                {teamName(project.teamId)} · {project.statusLabel || "—"}
              </p>
              <p>{project.summary || "—"}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
