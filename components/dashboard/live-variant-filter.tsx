export type LiveVariantFilter = "live" | "live-with-crs";

interface LiveVariantFilterProps {
  value: LiveVariantFilter;
  onChange: (value: LiveVariantFilter) => void;
}

export function LiveVariantFilterControl({ value, onChange }: LiveVariantFilterProps) {
  return (
    <label className="live-variant-filter">
      <span>Live view</span>
      <select
        aria-label="Live view"
        value={value}
        onChange={(event) => onChange(event.target.value as LiveVariantFilter)}
      >
        <option value="live">Live</option>
        <option value="live-with-crs">Live with CRs</option>
      </select>
    </label>
  );
}
