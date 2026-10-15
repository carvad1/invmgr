export const PAGE_SIZE = 20;
export function Pagination({
  count,
  page,
  change,
}: {
  count: number;
  page: number;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages === 1) return null;
  return (
    <div className="pagination" aria-label="Страницы списка">
      <span>
        {page * PAGE_SIZE + 1}–{Math.min(count, (page + 1) * PAGE_SIZE)} из{" "}
        {count}
      </span>
      <button
        className="button secondary small"
        disabled={page === 0}
        onClick={() => change(page - 1)}
      >
        Назад
      </button>
      <button
        className="button secondary small"
        disabled={page >= pages - 1}
        onClick={() => change(page + 1)}
      >
        Далее
      </button>
    </div>
  );
}
