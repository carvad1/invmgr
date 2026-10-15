import { useEffect, useMemo, useState } from "react";
import { paymentSchedule } from "../domain/finance";
import { dateLabel, Empty, money } from "../components/ui";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import type { PageProps } from "../components/workspace";
export default function Calendar({ p, asOf }: PageProps) {
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(0);
  const payments = useMemo(
    () =>
      p.positions
        .filter((p) => p.quantity > 0)
        .flatMap((pos) =>
          paymentSchedule(pos.instrument, pos.quantity, asOf).map((x) => ({
            ...x,
            instrument: pos.instrument,
          })),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [p, asOf],
  );
  const months = [...new Set(payments.map((x) => x.date.slice(0, 7)))];
  const rows = payments.filter((x) => !month || x.date.startsWith(month));
  useEffect(() => {
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)),
    );
  }, [rows.length]);
  return (
    <section className="panel">
      <div className="toolbar">
        <select
          aria-label="Месяц выплат"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Все предстоящие</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01T00:00:00`).toLocaleDateString("ru-RU", {
                month: "long",
                year: "numeric",
              })}
            </option>
          ))}
        </select>
        <span className="muted">
          {rows.length} выплат по сохранённым условиям
        </span>
      </div>
      {rows.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Актив</th>
                  <th>Выплата</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((x, n) => (
                    <tr key={`${x.instrument.id}:${x.date}:${n}`}>
                      <td>{dateLabel(x.date)}</td>
                      <td>
                        {x.instrument.name}
                        <small>{x.instrument.provider}</small>
                      </td>
                      <td>{x.type}</td>
                      <td>{money(x.amount, x.instrument.currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination count={rows.length} page={page} change={setPage} />
        </>
      ) : (
        <Empty
          title="Выплат пока нет"
          description="Для расчёта нужны открытая позиция, дата погашения и условия выплат."
        />
      )}
      <p className="footnote">
        Это прогноз, а не подтверждённый доход. Индексируемые выпуски без
        формулы не рассчитываются. Досрочный выход, налоги и изменения ставки не
        учтены.
      </p>
    </section>
  );
}
