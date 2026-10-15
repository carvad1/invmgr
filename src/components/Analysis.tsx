import { lazy, Suspense, useState } from "react";
import type { Instrument, State } from "../domain/types";
import { kindLabels } from "../domain/types";
import {
  daysBetween,
  depositProjection,
  fxAt,
  paymentSchedule,
  xirr,
} from "../domain/finance";
import { depositRateAt } from "../domain/deposit";
import { debtScenario } from "../domain/research";
import type { Portfolio } from "./workspace";
import { Empty, Metric, money, num, dateLabel } from "./ui";
import { ResearchSummary } from "./QuickResearch";
const PriceHistory = lazy(() => import("./PriceHistory"));

export default function Analysis({
  state,
  p,
  asOf,
  selected,
  select,
  edit,
  quote,
  buy,
  openSource,
}: {
  state: State;
  p: Portfolio;
  asOf: string;
  selected: string;
  select: (id: string) => void;
  edit: (i: Instrument) => void;
  quote: (i: Instrument) => void;
  buy: (id: string) => void;
  openSource: (url: string) => void;
}) {
  const i =
    state.instruments.find((i) => i.id === selected) ?? state.instruments[0];
  const [budget, setBudget] = useState(1000);
  const [days, setDays] = useState(365);
  const [fee, setFee] = useState(0);
  const [customPrice, setCustomPrice] = useState<{
    id: string;
    value: number;
  } | null>(null);
  const [showPrice, setShowPrice] = useState(false);
  if (!i)
    return (
      <section className="panel">
        <Empty
          title="Сохранённых расчётов пока нет"
          description="Откройте выпуск по ссылке или добавьте актив. Покупку можно записать позже."
        />
      </section>
    );
  const quotes = state.quotes
    .filter((q) => q.instrumentId === i.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const price =
    i.kind === "deposit"
      ? 1
      : customPrice?.id === i.id
        ? customPrice.value
        : (quotes.at(-1)?.price ?? i.nominal);
  const debt = ["bond", "token"].includes(i.kind);
  const scenario = debtScenario(i, budget, price, fee, days);
  const quantity = debt
    ? scenario.quantity
    : price > 0
      ? Math.max(0, budget - fee) / price
      : 0;
  const schedule = paymentSchedule(i, quantity, asOf);
  const ytm =
    debt &&
    quantity > 0 &&
    i.research?.rateModel !== "indexed" &&
    i.research?.rateKnown !== false &&
    i.research?.nominalKnown !== false &&
    i.frequency &&
    i.nextPayment &&
    i.maturity &&
    schedule.length
      ? xirr([{ date: asOf, amount: -scenario.invested }, ...schedule])
      : null;
  const projectionDays = i.maturity
    ? Math.max(0, Math.min(days, daysBetween(asOf, i.maturity)))
    : days;
  const projected =
    i.kind === "deposit"
      ? depositProjection(
          Math.max(0, budget - fee),
          depositRateAt(i, asOf),
          projectionDays,
          i.capitalization,
        ) - fee
      : debt
        ? scenario.interest
        : null;
  const benchmark = depositProjection(
    budget,
    state.settings.benchmarkRate,
    projectionDays,
  );
  const fx = fxAt(state, i.currency, asOf);
  const exposure = p.positions
    .filter(
      (pos) =>
        (pos.instrument.research?.issuer || pos.instrument.name) ===
        (i.research?.issuer || i.name),
    )
    .reduce((s, pos) => s + (pos.valueByn ?? 0), 0);
  const postTotal =
    p.totalByn !== null && fx ? p.totalByn + budget * fx.rate : null;
  const concentration =
    postTotal && fx ? ((exposure + budget * fx.rate) / postTotal) * 100 : null;
  return (
    <div className="page-stack">
      <div className="analysis-select toolbar">
        <label>
          <span className="sr-only">Инструмент для анализа</span>
          <select
            aria-label="Инструмент для анализа"
            value={i.id}
            onChange={(e) => {
              select(e.target.value);
              setShowPrice(false);
            }}
          >
            {state.instruments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <small>
            {kindLabels[i.kind]} · {i.provider} · {i.currency}
          </small>
        </label>
        <button className="button secondary" onClick={() => edit(i)}>
          Условия
        </button>
        <button className="button primary" onClick={() => buy(i.id)}>
          Записать покупку
        </button>
      </div>
      {debt && (
        <ResearchSummary instrument={i} edit={edit} openSource={openSource} />
      )}
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Доход и сценарии</h2>
            <p>Расчёт в {i.currency} по сохранённым условиям</p>
          </div>
          {i.sourceUrl && (
            <button
              className="text-button"
              onClick={() => openSource(i.sourceUrl)}
            >
              Первоисточник ↗
            </button>
          )}
        </div>
        <div className="scenario-inputs">
          <label>
            Бюджет, {i.currency}
            <input
              aria-label="Бюджет анализа"
              type="number"
              min="1"
              max="1000000000"
              value={budget}
              onChange={(e) =>
                setBudget(Math.min(1e9, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
          <label>
            Горизонт, дней
            <input
              type="number"
              min="1"
              max="36500"
              value={days}
              onChange={(e) =>
                setDays(Math.min(36500, Math.max(1, Number(e.target.value))))
              }
            />
          </label>
          <label>
            Комиссия
            <input
              type="number"
              min="0"
              value={fee}
              onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
            />
          </label>
          {i.kind !== "deposit" && (
            <label>
              Полная цена единицы
              <input
                type="number"
                min="0.000001"
                step="any"
                value={price}
                onChange={(e) =>
                  setCustomPrice({
                    id: i.id,
                    value: Math.max(0, Number(e.target.value)),
                  })
                }
              />
            </label>
          )}
        </div>
        <div className="analysis-metrics">
          <Metric
            label="Расчётный процентный доход"
            value={
              projected === null ? "Нет расчёта" : money(projected, i.currency)
            }
            hint={`${projectionDays} дн. · после комиссии`}
            positive={projected !== null && projected > 0}
          />
          {debt && (
            <Metric
              label="Процентный доход за период"
              value={
                scenario.returnPercent === null
                  ? "Нет расчёта"
                  : `${num(scenario.returnPercent)}%`
              }
              hint="От вложенной суммы с комиссией"
            />
          )}
          <Metric
            label={`Ориентир: депозит ${num(state.settings.benchmarkRate)}%`}
            value={money(benchmark, i.currency)}
            hint="В той же валюте, без капитализации"
          />
        </div>
        <p className="notice">
          {i.kind === "stock"
            ? "Цена акции и дивиденды не прогнозируются."
            : debt
              ? i.research?.rateModel === "indexed"
                ? "Выпуск индексируемый. Для прогноза нужна формула из проспекта; фиксированный расчёт отключён."
                : "Сценарий процентов при неизменной ставке и исполнении обязательств. Без результата погашения или продажи, изменения курса и налогов. Это не доходность к погашению."
              : "Сценарий по текущей ставке. Изменения ставки, досрочный выход и налоги не учтены; график банка может отличаться."}
        </p>
        {i.kind !== "deposit" && !quotes.length && (
          <p className="footnote">
            Цена взята из номинала. Введите фактическую полную цену покупки с
            НКД.
          </p>
        )}
        {debt && (
          <div className="detail-grid compact">
            <div>
              <small>Модельная YTM</small>
              <b>
                {ytm === null ? "Нужен полный график" : `${num(ytm * 100)}%`}
              </b>
            </div>
            <div>
              <small>Целых единиц</small>
              <b>{quantity}</b>
            </div>
            <div>
              <small>Вложено с комиссией</small>
              <b>{money(scenario.invested, i.currency)}</b>
            </div>
            <div>
              <small>Остаток бюджета</small>
              <b>{money(scenario.unspent, i.currency)}</b>
            </div>
          </div>
        )}
        <details className="compact-details">
          <summary>Допущения расчёта</summary>
          <p>
            База сценария — 365 дней. Проценты зависят от срока до погашения.
            Первый купон и НКД могут изменить результат. Капитализация вклада
            моделируется ежемесячно, неполный период — математической
            интерполяцией.
          </p>
          {debt && (
            <p>
              Модельная YTM — XIRR регулярных купонов и возврата номинала с
              учётом целого количества, полной цены и комиссии. Неполные
              купонные периоды, оферты и амортизация не моделируются; сверяйте
              график с выпуском.
            </p>
          )}
          <p>
            Концентрация на эмитенте после внесения новых денег:{" "}
            {concentration === null
              ? "не рассчитана без курса"
              : `${num(concentration, 1)}%`}
            . {i.notes || "Условия досрочного выхода не заполнены."}
          </p>
        </details>
      </section>
      {i.kind !== "deposit" && (
        <details className="panel">
          <summary>Финансовые показатели эмитента</summary>
          <p className="muted">
            {i.reportDate
              ? `Отчётность от ${dateLabel(i.reportDate)}`
              : "Заполните отчётность в условиях инструмента"}
          </p>
          <div className="detail-grid">
            {i.kind === "stock" && (
              <>
                <div>
                  <small>P/E</small>
                  <b>
                    {num(i.eps !== null && i.eps > 0 ? price / i.eps : null)}
                  </b>
                </div>
                <div>
                  <small>P/B</small>
                  <b>
                    {num(
                      i.bookValue !== null && i.bookValue > 0
                        ? price / i.bookValue
                        : null,
                    )}
                  </b>
                </div>
              </>
            )}
            <div>
              <small>Долг / капитал</small>
              <b>
                {num(
                  i.debt !== null && i.equity !== null && i.equity > 0
                    ? i.debt / i.equity
                    : null,
                )}
              </b>
            </div>
            <div>
              <small>Чистая маржа</small>
              <b>
                {i.netIncome !== null && i.revenue !== null && i.revenue > 0
                  ? `${num((i.netIncome / i.revenue) * 100)}%`
                  : "—"}
              </b>
            </div>
          </div>
          <button className="text-button" onClick={() => edit(i)}>
            Заполнить отчётность
          </button>
        </details>
      )}
      {i.kind !== "deposit" && (
        <section className="panel">
          <div className="section-title">
            <h2>История цены</h2>
            <div className="button-row">
              <button
                className="button secondary small"
                onClick={() => quote(i)}
              >
                Добавить цену
              </button>
              <button
                className="text-button"
                aria-expanded={showPrice}
                onClick={() => setShowPrice(!showPrice)}
              >
                {showPrice ? "Скрыть" : "Показать"}
              </button>
            </div>
          </div>
          {showPrice && (
            <Suspense fallback={<p>Загружаем график…</p>}>
              <PriceHistory quotes={quotes} currency={i.currency} />
            </Suspense>
          )}
        </section>
      )}
    </div>
  );
}
