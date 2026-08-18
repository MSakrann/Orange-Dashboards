import type { DeptTeam } from "@/data/dept-structure";

function projectLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

export function DeptStructureGrid({
  headName,
  headTitle,
  teams,
}: {
  headName: string;
  headTitle: string;
  teams: DeptTeam[];
}) {
  const countClass = `dept-team-grid count-${Math.min(Math.max(teams.length, 1), 6)}`;

  return (
    <section className="dept-section dept-structure" aria-labelledby="dept-structure-heading">
      <div className="dept-section-inner">
        <h2 id="dept-structure-heading">Structure</h2>
        <p className="dept-section-lead">Department head and the teams underneath.</p>

        <div className="dept-head-block">
          <p className="dept-head-label">Department head</p>
          <p className="dept-head-name">{headName || "—"}</p>
          {headTitle ? <p className="dept-head-title">{headTitle}</p> : null}
        </div>

        {teams.length === 0 ? (
          <p className="dept-empty">No teams yet.</p>
        ) : (
          <ul className={countClass}>
            {teams.map((team) => (
              <li key={team.id}>
                <h3>{team.name}</h3>
                <p className="dept-team-lead">Lead: {team.leadName || "—"}</p>
                <p className="dept-team-meta">
                  {team.members.length} members · {projectLabel(team.projectCount)}
                </p>
                {team.scope.trim() ? <p className="dept-team-scope">{team.scope}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
