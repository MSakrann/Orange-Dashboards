import type { DeptTeam } from "@/data/dept-structure";

export function DeptStructureGrid({
  headName,
  headTitle,
  teams,
  projectCountByTeam,
}: {
  headName: string;
  headTitle: string;
  teams: DeptTeam[];
  projectCountByTeam: Map<string, number>;
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
                <div className="dept-team-meta-row">
                  <p className="dept-team-meta">
                    {team.members.length} members · {projectCountByTeam.get(team.id) ?? 0} projects
                  </p>
                  {team.activitySummary ? (
                    <p className="dept-team-activity">{team.activitySummary}</p>
                  ) : null}
                </div>
                <p className="dept-team-scope">{team.scope || "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
