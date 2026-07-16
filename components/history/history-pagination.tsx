import Link from "next/link";
import {
  buildHistorySearchParams,
  type HistoryFilters,
  type HistoryPageData,
} from "@/lib/data/history";

function pageHref(historyPath: string, filters: HistoryFilters, page: number) {
  const query = buildHistorySearchParams({ ...filters, page }).toString();
  return query ? `${historyPath}?${query}` : historyPath;
}

export function HistoryPagination({
  historyPath,
  filters,
  result,
}: {
  historyPath: string;
  filters: HistoryFilters;
  result: HistoryPageData;
}) {
  if (result.totalCount === 0) return null;

  return (
    <nav aria-label="History pagination" className="history-pagination">
      {result.page > 1 ? (
        <Link
          href={pageHref(
            historyPath,
            { ...filters, snapshotAt: result.snapshotAt },
            result.page - 1,
          )}
        >
          Previous
        </Link>
      ) : <span />}
      <span>Page {result.page} of {result.pageCount} · {result.totalCount} events</span>
      {result.page < result.pageCount ? (
        <Link
          href={pageHref(
            historyPath,
            { ...filters, snapshotAt: result.snapshotAt },
            result.page + 1,
          )}
        >
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}
