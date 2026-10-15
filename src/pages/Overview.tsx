import { lazy, Suspense, useMemo, useState } from "react";
import { paymentSchedule, fxAt } from "../domain/finance";
import { dateLabel, Empty, Metric, money, num } from "../components/ui";
import type { PageProps } from "../components/workspace";
const History = lazy(() => import("../components/PortfolioHistory"));

export default function Overview({ state, p, actions, asOf }: PageProps) {
  const [showHistory, setShowHistory] = useState(false);
  const active = p.positions.filter((p) => p.quantity > 0);
  const rate = fxAt(state, state.settings.baseCurrency, asOf)?.rate;
  const display = (v: number | null) =>
    money(v === null || !rate ? null : v / rate, state.settings.baseCurrency);
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
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [p, asOf],
  );
  if (!state.operations.length)
    return (
      <section className="panel">
        <Empty
          title="Добавьте первый актив"
          description="Запишите вклад или покупку. Здесь появятся стоимость портфеля, доход и ближайшие выплаты."
          action={
            <button className="button primary" onClick={actions.add}>
              Добавить мой вклад
            </button>
          }
        />
      </section>
    );
  return (
    <div className="page-stack">
      <div className="metrics">
        <Metric
          label="Стоимость портфеля"
          value={display(p.totalByn)}
          hint="Активы, деньги и расчётные проценты"
        />
        <Metric
          label="Общий результат"
          value={display(p.profitByn)}
          hint="С учётом пополнений, выводов и комиссий"
          positive={(p.profitByn ?? 0) > 0}
        />
        <Metric
          label="Доходность · XIRR"
          value={
            p.annualReturn === null ? "—" : `${num(p.annualReturn * 100)}%`
          }
          hint="Годовая оценка по датам вложений"
        />
      </div>
      {!!p.warnings.length && (
        <details className="notice">
          <summary>Проверьте данные · {p.warnings.length}</summary>
          {p.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      )}
      <div className="overview-columns">
        <section className="panel">
          <div className="section-title">
            <h2>В портфеле</h2>
            <span className="muted">Активов: {active.length}</span>
          </div>
          {active.slice(0, 6).map((pos) => (
            <button
              className="list-row clickable"
              key={pos.instrument.id}
              onClick={() => actions.analyze(pos.instrument.id)}
            >
              <span>
                <strong>{pos.instrument.name}</strong>
                <small>
                  {pos.instrument.provider} · {pos.instrument.currency}
                </small>
              </span>
              <span className="align-right">
                <strong>{display(pos.valueByn)}</strong>
                <small>
                  {pos.instrument.kind === "deposit"
                    ? "Основная сумма вклада"
                    : pos.estimated
                      ? "Оценка по стоимости покупки"
                      : `Цена: ${dateLabel(pos.priceDate)}`}
                </small>
              </span>
            </button>
          ))}
          {!active.length && <p className="muted">Открытых позиций нет.</p>}
          {!!p.cash.length && (
            <details className="compact-details">
              <summary>Деньги на счетах · {display(p.cashByn)}</summary>
              {p.cash.map((c) => (
                <div className="list-row" key={`${c.provider}:${c.currency}`}>
                  <span>{c.provider}</span>
                  <b>{money(c.amount, c.currency)}</b>
                </div>
              ))}
            </details>
          )}
          {p.hasAutoAccrual && (
            <section
              className="accrual-strip"
              aria-label="Автоматический расчёт процентов"
            >
              <div>
                <h2>Расчётные проценты</h2>
                <p>
                  Уже входят в стоимость портфеля. Подтверждённые выплаты
                  вычтены.
                </p>
              </div>
              <strong>{display(p.accruedByn)}</strong>
            </section>
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Ближайшие выплаты</h2>
          </div>
          {payments.map((x, n) => (
            <div className="list-row" key={`${x.instrument.id}:${x.date}:${n}`}>
              <span>
                <strong>{x.instrument.name}</strong>
                <small>
                  {dateLabel(x.date)} · {x.type}
                </small>
              </span>
              <b>{money(x.amount, x.instrument.currency)}</b>
            </div>
          ))}
          {!payments.length && (
            <p className="muted">
              Нет рассчитанных выплат. Проверьте даты и условия в карточках
              активов.
            </p>
          )}
          <p className="footnote">
            План по сохранённым условиям. Выплаты подтверждаются операциями.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>История портфеля</h2>
            <p>Снимки стоимости и вложений за выбранный период</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setShowHistory(!showHistory)}
            aria-expanded={showHistory}
          >
            {showHistory ? "Скрыть график" : "Показать график"}
          </button>
        </div>
        {showHistory && (
          <Suspense fallback={<p role="status">Загружаем график…</p>}>
            <History state={state} asOf={asOf} />
          </Suspense>
        )}
      </section>
    </div>
  );
}
