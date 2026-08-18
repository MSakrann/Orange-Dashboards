import type { DeptTeam } from "@/data/dept-structure";

export function DeptTeamChapters({ teams }: { teams: DeptTeam[] }) {
  if (teams.length === 0) return null;

  return (
    <section className="dept-section dept-chapters" aria-labelledby="dept-chapters-heading">
      <div className="dept-section-inner">
        <h2 id="dept-chapters-heading">Teams</h2>
        <p className="dept-section-lead">Lead, focus, goal, and people for each team.</p>

        <div className="dept-chapter-list">
          {teams.map((team) => (
            <article key={team.id} className="dept-chapter">
              <header className="dept-chapter-header">
                <h3>{team.name}</h3>
              </header>
              <p className="dept-chapter-lead">Led by {team.leadName || "—"}</p>
              <dl className="dept-chapter-facts">
                <div className="dept-field-card">
                  <dt>Focus</dt>
                  <dd>{team.focus || "—"}</dd>
                </div>
                <div className="dept-field-card">
                  <dt>Goal</dt>
                  <dd>{team.goal || "—"}</dd>
                </div>
                {team.activitySummary.trim() ? (
                  <div className="dept-field-card">
                    <dt>Activity</dt>
                    <dd>{team.activitySummary}</dd>
                  </div>
                ) : null}
                </dl>
              <div className="dept-field-card dept-members-card">
                <h4 className="dept-members-heading">Members</h4>
                {team.members.length === 0 ? (
                  <p className="dept-empty">No members listed.</p>
                ) : (
                  <ul className="dept-member-list">
                    {team.members.map((member) => (
                      <li key={member.id}>
                        <span>{member.name}</span>
                        {member.role ? <span className="dept-member-role">{member.role}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
