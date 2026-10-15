import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { operationLabels } from "../domain/types";
import { operationValue, sortOperations } from "../domain/finance";
import { dateLabel, Empty, money } from "../components/ui";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import type { PageProps } from "../components/workspace";
export default function Journal({ state, actions }: PageProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const names = useMemo(
    () => new Map(state.instruments.map((i) => [i.id, i.name])),
    [state.instruments],
  );
  const rows = useMemo(
    () =>
      sortOperations(state.operations)
        .reverse()
        .filter(
          (o) =>
            (kind === "all" || kind === o.kind) &&
            `${names.get(o.instrumentId) ?? o.provider} ${o.note} ${o.thesis.reason}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
    [state.operations, names, query, kind],
  );
  useEffect(() => {
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)),
    );
  }, [rows.length]);
  return (
    <section className="panel">
      <div className="toolbar">
        <input
          aria-label="Поиск операции"
          placeholder="Актив, причина или комментарий"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Тип операции"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Все операции</option>
          {Object.entries(operationLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {!rows.length ? (
        <Empty
          title="Нет операций"
          description="Запишите пополнение, покупку или выплату дохода."
          action={
            <button className="button primary" onClick={() => actions.buy()}>
              Добавить операцию
            </button>
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Операция / актив</th>
                  <th>Сумма</th>
                  <th>Комментарий</th>
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap">{dateLabel(o.date)}</td>
                      <td>
                        <strong>{operationLabels[o.kind]}</strong>
                        <small>
                          {names.get(o.instrumentId) ?? o.provider}
                          {o.linkedId && " · автопополнение"}
                        </small>
                      </td>
                      <td className="nowrap">
                        {money(operationValue(o), o.currency)}
                        {o.fee > 0 && (
                          <small>Комиссия: {money(o.fee, o.currency)}</small>
                        )}
                      </td>
                      <td>
                        <div
                          className="reason-cell"
                          title={o.thesis.reason || o.note}
                        >
                          {o.thesis.reason || o.note || "—"}
                        </div>
                      </td>
                      <td>
                        {!o.linkedId && (
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label="Изменить операцию"
                              onClick={() => actions.editOperation(o)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label="Удалить операцию"
                              onClick={() => actions.removeOperation(o)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination count={rows.length} page={page} change={setPage} />
        </>
      )}
    </section>
  );
}
