import { useEffect, useState } from "react";
import { kindLabels, kinds } from "../domain/types";
import { dateLabel, Empty, Modal, money, num } from "../components/ui";
import type { PageProps } from "../components/workspace";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import { depositRateAt } from "../domain/deposit";

export default function Assets({ state, p, actions, asOf }: PageProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState("");
  const rows = p.positions.filter(
    (pos) =>
      (kind === "all" || pos.instrument.kind === kind) &&
      `${pos.instrument.name} ${pos.instrument.provider} ${pos.instrument.ticker}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  useEffect(() => {
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)),
    );
  }, [rows.length]);
  const pos = p.positions.find((pos) => pos.instrument.id === selected);
  const i = pos?.instrument;
  return (
    <section className="panel">
      <div className="toolbar">
        <input
          aria-label="Поиск актива"
          placeholder="Название или площадка"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Тип актива"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Все типы</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </select>
      </div>
      {!rows.length ? (
        <Empty
          title="Активов пока нет"
          description="Добавьте инструмент вручную или сохраните из раздела «Анализ»."
          action={
            <button className="button primary" onClick={actions.add}>
              Добавить актив
            </button>
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Актив</th>
                  <th>Ставка</th>
                  <th>Количество</th>
                  <th>Стоимость</th>
                  <th>Погашение</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((pos) => (
                    <tr key={pos.instrument.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setSelected(pos.instrument.id)}
                        >
                          {pos.instrument.name}
                        </button>
                        <small>
                          {kindLabels[pos.instrument.kind]} ·{" "}
                          {pos.instrument.provider} · {pos.instrument.currency}
                        </small>
                      </td>
                      <td>
                        {pos.instrument.kind === "stock" ||
                        pos.instrument.research?.rateKnown === false
                          ? "—"
                          : `${num(depositRateAt(pos.instrument, asOf))}%`}
                      </td>
                      <td>{num(pos.quantity)}</td>
                      <td>
                        {money(
                          pos.quantity * pos.price,
                          pos.instrument.currency,
                        )}
                        <small>
                          {pos.quantity === 0
                            ? "Сохранён для анализа"
                            : pos.estimated
                              ? "По стоимости покупки"
                              : "По сохранённой цене"}
                        </small>
                      </td>
                      <td>{dateLabel(pos.instrument.maturity)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination count={rows.length} page={page} change={setPage} />
        </>
      )}
      {pos && i && (
        <Modal
          title={i.name}
          subtitle={`${kindLabels[i.kind]} · ${i.provider} · ${i.currency}`}
          close={() => setSelected("")}
        >
          <div className="detail-grid">
            <div>
              <small>Стоимость позиции</small>
              <b>{money(pos.quantity * pos.price, i.currency)}</b>
            </div>
            <div>
              <small>Расчётные проценты</small>
              <b>{money(pos.accrued, i.currency)}</b>
            </div>
            <div>
              <small>Ставка / купон</small>
              <b>
                {i.kind === "stock" || i.research?.rateKnown === false
                  ? "—"
                  : `${num(depositRateAt(i, asOf))}%`}
              </b>
            </div>
            <div>
              <small>Погашение</small>
              <b>{dateLabel(i.maturity)}</b>
            </div>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => {
                setSelected("");
                actions.analyze(i.id);
              }}
            >
              Анализ
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setSelected("");
                actions.buy(i.id);
              }}
            >
              Записать операцию
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setSelected("");
                actions.edit(i);
              }}
            >
              Изменить условия
            </button>
            {i.kind !== "deposit" && (
              <button
                className="button secondary"
                onClick={() => {
                  setSelected("");
                  actions.quote(i);
                }}
              >
                Добавить цену
              </button>
            )}
          </div>
          {i.notes && <p>{i.notes}</p>}
          <details className="compact-details">
            <summary>Причины покупок</summary>
            {state.operations
              .filter((o) => o.instrumentId === i.id && o.kind === "buy")
              .map((o) => (
                <article className="thesis" key={o.id}>
                  <h3>{dateLabel(o.date)}</h3>
                  <p>{o.thesis.reason}</p>
                  {[
                    ["Цель", o.thesis.goal],
                    ["Срок", o.thesis.horizon],
                    ["Ожидания", o.thesis.expectation],
                    ["Риски", o.thesis.risks],
                    ["Условия выхода", o.thesis.exit],
                  ].map(
                    ([label, value]) =>
                      value && (
                        <p key={label}>
                          <strong>{label}:</strong> {value}
                        </p>
                      ),
                  )}
                </article>
              ))}
          </details>
          <details className="compact-details">
            <summary>Учёт и результат · BYN</summary>
            <div className="detail-grid">
              <div>
                <small>Выплаченный доход</small>
                <b>{money(pos.incomeByn)}</b>
              </div>
              <div>
                <small>Результат закрытых сделок</small>
                <b>{money(pos.realizedByn)}</b>
              </div>
              <div>
                <small>Переоценка</small>
                <b>{money(pos.unrealizedByn)}</b>
              </div>
              <div>
                <small>Валютный эффект</small>
                <b>{money(pos.fxImpactByn)}</b>
              </div>
              <div>
                <small>Комиссии</small>
                <b>{money(pos.feesByn)}</b>
              </div>
            </div>
          </details>
          <footer className="form-footer">
            <button
              className="text-button danger"
              onClick={() => {
                setSelected("");
                actions.remove(i);
              }}
            >
              Удалить актив
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
