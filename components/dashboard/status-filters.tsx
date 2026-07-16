import type { DashboardStatus } from "@/lib/data/dashboard";

export type StatusFilter = "all" | string;

interface StatusFiltersProps {
  activeFilter: StatusFilter;
  statuses: DashboardStatus[];
  onChange: (filter: StatusFilter) => void;
}

export function StatusFilters({ activeFilter, statuses, onChange }: StatusFiltersProps) {
  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "All Projects" },
    ...statuses.map((status) => ({ value: status.id, label: status.name })),
  ];
  return (
    <div className="filters" aria-label="Filter projects by status">
      {filters.map((filter) => (
        <button
          className="filter-button"
          data-active={activeFilter === filter.value}
          type="button"
          aria-pressed={activeFilter === filter.value}
          key={filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
