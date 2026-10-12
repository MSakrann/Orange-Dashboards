const complexityRows = [
  { complexity: "Low", effort: "1–3 WDs" },
  { complexity: "Medium", effort: "4–10 WDs" },
  { complexity: "High", effort: "10–20 WDs" },
] as const;

export function PeDeliveryNotes() {
  return (
    <aside className="pe-delivery-notes" aria-label="PE Development effort guide">
      <div className="pe-delivery-notes-panel">
        <p className="eyebrow">Complexity guide</p>
        <table className="pe-complexity-table">
          <thead>
            <tr>
              <th scope="col">Complexity</th>
              <th scope="col">Effort</th>
            </tr>
          </thead>
          <tbody>
            {complexityRows.map((row) => (
              <tr key={row.complexity}>
                <th scope="row">{row.complexity}</th>
                <td>{row.effort}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pe-delivery-notes-panel pe-delivery-notes-average">
        <p className="eyebrow">Recent averages</p>
        <p className="pe-delivery-notes-copy">
          Average efforts in the last 3 months:{" "}
          <strong>2 WDs</strong> for Change Requests and{" "}
          <strong>10 WDs</strong> for new promos.
        </p>
      </div>
    </aside>
  );
}
