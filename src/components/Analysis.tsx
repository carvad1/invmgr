import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
  SlidersHorizontal,
  ExternalLink,
  Pencil,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Instrument, State } from "../domain/types";
import { kindLabels, today } from "../domain/types";
import {
  daysBetween,
  depositProjection,
  fxAt,
  paymentSchedule,
  portfolio,
  technicals,
  xirr,
} from "../domain/finance";
import { Banner, Empty, Metric, money, num, dateLabel } from "./ui";
import { debtScenario } from "../domain/research";
import { ResearchSummary } from "./QuickResearch";

export default function Analysis({
  state,
  selected,
  select,
  edit,
  quote,
  buy,
  openSource,
}: {
  state: State;
  selected: string;
  select: (id: string) => void;
  edit: (i: Instrument) => void;
  quote: (i: Instrument) => void;
  buy: (id: string) => void;
  openSource: (url: string) => void;
}) {
  const instrument =
    state.instruments.find((i) => i.id === selected) ?? state.instruments[0];
  const [budget, setBudget] = useState(1000);
  const [days, setDays] = useState(365);
  const [fee, setFee] = useState(0);
  const [customPrice, setCustomPrice] = useState<{
    id: string;
    value: number;
  } | null>(null);
  const p = useMemo(() => portfolio(state), [state]);
  if (!instrument)
    return (
      <Empty
        title="Начните с инструмента"
        description="Добавьте вклад или сохраните инструмент из каталога. Здесь появятся расчёты дохода, показатели и вопросы для проверки перед покупкой."
      />
    );
  const i = instrument;
  const quotes = state.quotes
    .filter((q) => q.instrumentId === i.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastPrice = quotes.at(-1)?.price ?? i.nominal;
  const price =
    i.kind === "deposit"
      ? 1
      : customPrice?.id === i.id
        ? customPrice.value
        : lastPrice;
  const debt = ["bond", "token"].includes(i.kind);
  const scenario = debtScenario(i, budget, price, fee, days);
  const quantity = debt
    ? scenario.quantity
    : price > 0
      ? Math.max(0, budget - fee) / price
      : 0;
  const fx = fxAt(state, i.currency, today());
  const position = p.positions.find((p) => p.instrument.id === i.id)!;
  const issuerExposure = p.positions
    .filter(
      (p) =>
        (p.instrument.research?.issuer || p.instrument.name) ===
        (i.research?.issuer || i.name),
    )
    .reduce((sum, p) => sum + (p.valueByn ?? 0), 0);
  const postTotal =
    p.totalByn !== null && fx ? p.totalByn + budget * fx.rate : null;
  const concentration =
    postTotal && fx
      ? ((issuerExposure + budget * fx.rate) / postTotal) * 100
      : null;
  const schedule = paymentSchedule(i, quantity);
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
      ? xirr([{ date: today(), amount: -scenario.invested }, ...schedule])
      : null;
  const projectionDays = i.maturity
    ? Math.max(0, Math.min(days, daysBetween(today(), i.maturity)))
    : days;
  const projected =
    i.kind === "deposit"
      ? depositProjection(
          Math.max(0, budget - fee),
          i.annualRate,
          projectionDays,
          i.capitalization,
        ) - fee
      : ["bond", "token"].includes(i.kind)
        ? scenario.interest
        : null;
  const benchmark = depositProjection(
    budget,
    state.settings.benchmarkRate,
    projectionDays,
  );
  const tech = technicals(quotes.map((q) => q.price));
  const missing = [
    !i.maturity && i.kind !== "stock" && "дата погашения",
    !i.nextPayment && i.kind !== "stock" && "дата купона / процентов",
    !i.reportDate && i.kind !== "deposit" && "отчётность эмитента",
    quotes.length < 20 && i.kind === "stock" && "история котировок",
    !i.notes && "условия досрочного выхода",
  ].filter(Boolean);
  const risks = [
    {
      warning: debt || !i.notes,
      title: "Ликвидность и выход",
      text:
        i.notes ||
        "Добавьте условия досрочного расторжения, продажи и возможные потери дохода.",
    },
    {
      warning: concentration === null || concentration > 30,
      title: "Концентрация после покупки",
      text:
        concentration === null
          ? "Для расчёта нужен валютный курс."
          : `${num(concentration, 1)}% на эмитенте (если не указан — по названию инструмента). Сценарий предполагает внесение новых денег; порог внимания — 30%.`,
    },
    {
      warning: !i.reportDate && i.kind !== "deposit",
      title: i.kind === "deposit" ? "Условия банка" : "Эмитент и обязательства",
      text:
        i.kind === "deposit"
          ? "Сверьте ставку, отзывность и условия возврата с договором банка."
          : i.reportDate
            ? `Отчётность от ${dateLabel(i.reportDate)}. Проверьте актуальность, обеспечение и долговую нагрузку.`
            : "Нет финансовой отчётности. Ставка сама по себе не подтверждает надёжность эмитента.",
    },
    {
      warning: i.currency !== "BYN",
      title: "Валюта и переоценка",
      text:
        i.currency === "BYN"
          ? "Валюта инструмента — BYN. Учитывайте покупательную способность будущих выплат."
          : `Выплаты в ${i.currency}; итог в BYN будет зависеть от курса. Индексация и расчёты могут иметь особые условия.`,
    },
  ];
  return (
    <div className="analysis-layout">
      <div className="panel instrument-selector">
        <div className="asset-icon">{i.name.slice(0, 2).toUpperCase()}</div>
        <div className="grow">
          <small>ИНСТРУМЕНТ ДЛЯ АНАЛИЗА</small>
          <select
            aria-label="Инструмент для анализа"
            value={i.id}
            onChange={(e) => select(e.target.value)}
          >
            {state.instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <span>
            {kindLabels[i.kind]} · {i.provider} · {i.currency}
          </span>
        </div>
        <button className="button secondary" onClick={() => edit(i)}>
          <Pencil size={15} />
          Условия
        </button>
        <button className="button primary" onClick={() => buy(i.id)}>
          Записать покупку
          <ArrowUpRight size={16} />
        </button>
      </div>
      {debt && (
        <ResearchSummary instrument={i} openSource={openSource} edit={edit} />
      )}
      <div className="analysis-columns">
        <div className="analysis-main">
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Доход и сценарии</h2>
                <p>Расчёт по введённым условиям, в валюте инструмента</p>
              </div>
              <SlidersHorizontal size={20} />
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
                    setBudget(Math.max(0, Number(e.target.value)))
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
                    setDays(
                      Math.min(36500, Math.max(1, Number(e.target.value))),
                    )
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
                  projected === null
                    ? "Не прогнозируется"
                    : money(projected, i.currency)
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
                  hint={`${scenario.horizon} дн. · от вложенной суммы с комиссией`}
                />
              )}
              <Metric
                label={`Ориентир: депозит ${num(state.settings.benchmarkRate)}%`}
                value={money(benchmark, i.currency)}
                hint="Заданная вами ставка, без капитализации"
              />
            </div>
            <Banner>
              {i.kind === "stock"
                ? "Будущая цена акции и дивиденды неизвестны. Оцените отчётность и историю цены ниже."
                : debt
                  ? i.research?.rateModel === "indexed"
                    ? "Доход индексируется или меняется по формуле. Для денежного прогноза нужны условия из проспекта; фиксированный расчёт отключён."
                    : "Сценарий при неизменной ставке и исполнении обязательств: только проценты, без прибыли/убытка от погашения или продажи, изменения курса и налогов. База 365 дней; первый купон и НКД могут изменить результат. Это не доходность к погашению."
                  : "Сценарий по текущей ставке; фактический график банка может отличаться."}
            </Banner>
            {debt && (
              <p className="muted">
                Целых единиц: {quantity}. Вложено с комиссией:{" "}
                {money(scenario.invested, i.currency)}. Свободный остаток
                бюджета: {money(scenario.unspent, i.currency)}.
                {quantity === 0
                  ? " Бюджета не хватает на одну единицу с комиссией."
                  : ""}
                {!i.maturity
                  ? " Точная дата погашения не задана: горизонт пока не ограничен сроком выпуска."
                  : ""}
              </p>
            )}
            {i.kind !== "deposit" && !quotes.length && (
              <p className="muted">
                Начальная цена взята из номинала. Введите фактическую полную
                цену покупки с НКД.
              </p>
            )}
            {i.kind === "deposit" && (
              <p className="muted">
                База расчёта — 365 дней. Капитализация:{" "}
                {i.capitalization
                  ? "ежемесячная, для неполного периода — математическая интерполяция"
                  : "отсутствует"}
                . Реальный график банка может отличаться.
              </p>
            )}
            {["bond", "token"].includes(i.kind) && (
              <div className="inline-stats">
                <div>
                  <span>Модельная YTM</span>
                  <b>
                    {ytm === null
                      ? "Нужен полный график"
                      : `${num(ytm * 100)}%`}
                  </b>
                </div>
                <div>
                  <span>Купонная ставка</span>
                  <b>
                    {i.research?.rateKnown === false
                      ? "Не указана"
                      : `${num(i.annualRate)}%`}
                  </b>
                </div>
                <div>
                  <span>Погашение</span>
                  <b>{dateLabel(i.maturity)}</b>
                </div>
              </div>
            )}
            {["bond", "token"].includes(i.kind) && (
              <p className="muted">
                Модельная YTM — XIRR регулярных купонов и возврата номинала с
                учётом целого количества, полной цены с НКД и комиссии. Неполные
                купонные периоды, оферты и амортизация не моделируются; сверяйте
                график с выпуском.
              </p>
            )}
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Финансовые показатели</h2>
                <p>
                  {i.reportDate
                    ? `Из вашей отчётности от ${dateLabel(i.reportDate)}`
                    : "Заполните отчётность в карточке инструмента"}
                </p>
              </div>
            </div>
            <div className="fundamentals">
              {i.kind === "stock" && (
                <>
                  <div>
                    <span>P/E</span>
                    <b>
                      {num(i.eps !== null && i.eps > 0 ? price / i.eps : null)}
                    </b>
                    <small>Цена / прибыль на акцию</small>
                  </div>
                  <div>
                    <span>P/B</span>
                    <b>
                      {num(
                        i.bookValue !== null && i.bookValue > 0
                          ? price / i.bookValue
                          : null,
                      )}
                    </b>
                    <small>Цена / балансовая стоимость</small>
                  </div>
                </>
              )}
              <div>
                <span>Долг / капитал</span>
                <b>
                  {num(
                    i.debt !== null && i.equity !== null && i.equity > 0
                      ? i.debt / i.equity
                      : null,
                  )}
                </b>
                <small>При положительном капитале</small>
              </div>
              <div>
                <span>Чистая маржа</span>
                <b>
                  {i.netIncome !== null && i.revenue !== null && i.revenue > 0
                    ? `${num((i.netIncome / i.revenue) * 100)}%`
                    : "—"}
                </b>
                <small>Чистая прибыль / выручка</small>
              </div>
            </div>
          </section>
          {!debt && (
            <section className="panel">
              <div className="section-title">
                <div>
                  <h2>История цены</h2>
                  <p>
                    Только сохранённые котировки · {quotes.length} наблюдений
                  </p>
                </div>
                {i.kind !== "deposit" && (
                  <button
                    className="button secondary small"
                    onClick={() => quote(i)}
                  >
                    Добавить цену
                  </button>
                )}
              </div>
              {quotes.length > 1 ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={quotes}>
                      <CartesianGrid vertical={false} stroke="#eef1f5" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => v.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v) => money(Number(v), i.currency)}
                      />
                      <Area
                        isAnimationActive={false}
                        dataKey="price"
                        name="Цена"
                        stroke="#138b79"
                        fill="#e4f4ef"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-placeholder">
                  График появится после добавления двух цен на разные даты.
                </div>
              )}
              <div className="inline-stats">
                <div>
                  <span>SMA 20</span>
                  <b>{num(tech.sma20)}</b>
                </div>
                <div>
                  <span>SMA 50</span>
                  <b>{num(tech.sma50)}</b>
                </div>
                <div>
                  <span>RSI 14 (простое среднее)</span>
                  <b>{num(tech.rsi)}</b>
                </div>
              </div>
              <p className="muted">
                Индикаторы рассчитаны по наблюдениям, не обязательно по торговым
                дням. Для SMA нужны 20 / 50 цен, для RSI — 15. Они не являются
                сигналом к покупке.
              </p>
            </section>
          )}
        </div>
        <aside className="analysis-side">
          <section className="panel">
            <div className="eyebrow">ПЕРЕД РЕШЕНИЕМ</div>
            <h2 className="decision-title">
              {missing.length ? "Дополните картину" : "Проверьте условия"}
            </h2>
            <p className="muted">
              {missing.length
                ? `Не хватает: ${missing.join(", ")}.`
                : "Данные заполнены. Сверьте их с первоисточником и своей инвестиционной идеей."}
            </p>
            <div className="check-list">
              {risks.map((r) => (
                <div key={r.title}>
                  {r.warning ? (
                    <TriangleAlert size={18} className="amber" />
                  ) : (
                    <CircleCheck size={18} className="positive" />
                  )}
                  <section>
                    <h4>{r.title}</h4>
                    <p>{r.text}</p>
                  </section>
                </div>
              ))}
            </div>
            {i.sourceUrl && (
              <button
                className="button secondary full"
                onClick={() => openSource(i.sourceUrl)}
              >
                Открыть первоисточник
                <ExternalLink size={14} />
              </button>
            )}
          </section>
          <section className="panel soft">
            <CircleHelp size={23} />
            <h3>Ваше решение — в контексте</h3>
            <p>
              Позиция сейчас:{" "}
              {money(
                position.quantity ? position.quantity * position.price : 0,
                i.currency,
              )}
              . После покупки сохраните причину, ожидания и условия выхода. Это
              поможет проверить исходную идею позже.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
