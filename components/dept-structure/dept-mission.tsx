export function DeptMission({ mission }: { mission: string }) {
  if (!mission.trim()) return null;

  return (
    <section className="dept-section dept-mission" aria-labelledby="dept-mission-heading">
      <div className="dept-section-inner">
        <h2 id="dept-mission-heading">Mission</h2>
        <p className="dept-mission-text">{mission}</p>
      </div>
    </section>
  );
}
