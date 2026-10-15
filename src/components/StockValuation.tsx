import { useState } from "react";
import type { Instrument } from "../domain/types";
import {
  emptyStockAnalysis,
  valuationSchema,
  type StockValuation as Valuation,
} from "../domain/stock-schema";
import { equityValue, impliedGrowth } from "../domain/stocks";
import { latestWebDividend } from "../domain/stock-web";
import { Field, money, num, Metric } from "./ui";

export default function StockValuation({
  instrument: i,
  price,
  save,
}: {
  instrument: Instrument;
  price: number | null;
  save: (i: Instrument) => Promise<void>;
}) {
  const p = i.stockAnalysis ?? emptyStockAnalysis();
  const dividend = latestWebDividend(i);
  const [v, setV] = useState(p.valuation);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = equityValue(v);
  const reverse = impliedGrowth(v, price);
  const change = (key: keyof Valuation, value: unknown) =>
    setV({ ...v, [key]: value });
  const moneyLabel = (n: number | null) => money(n, i.currency);
  const scenarios = [
    { label: "Осторожный", growth: v.growth - 5, discount: v.discount + 2 },
    { label: "Базовый", growth: v.growth, discount: v.discount },
    { label: "Оптимистичный", growth: v.growth + 5, discount: v.discount - 2 },
  ];
  return (
    <div className="page-stack">
      <div className="notice">
        Это сценарная модель на ваших допущениях. Начальные ставки — примеры для
        настройки. У акции нет фиксированной доходности: дивиденды, прибыль и
        цена могут снижаться.
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const valuation = valuationSchema.parse(v);
            await save({ ...i, stockAnalysis: { ...p, valuation } });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {dividend && (
          <p className="notice">
            Официальная выплата за {dividend.earningsYear}:{" "}
            {num(dividend.amount, 6)} {dividend.currency}.{" "}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setV({
                  ...v,
                  model: "dividend",
                  cashFlow: dividend.amount,
                  source: `Сценарий на основе выплаты за ${dividend.earningsYear}; устойчивость будущих выплат требует оценки. ${dividend.source}`,
                })
              }
            >
              Взять за основу сценария DDM
            </button>
          </p>
        )}
        <div className="form-grid">
          <Field label="Модель">
            <select
              value={v.model}
              onChange={(e) => change("model", e.target.value)}
            >
              <option value="fcfe">DCF: поток акционерам (FCFE)</option>
              <option value="dividend">DDM: дивиденды</option>
            </select>
          </Field>
          <Field
            label={
              v.model === "fcfe"
                ? "Нормализованный FCFE на акцию за год"
                : "Устойчивый дивиденд на акцию за год"
            }
            hint={`В ${i.currency}; положительный поток до начала прогнозного периода`}
          >
            <input
              type="number"
              min="0.000001"
              step="any"
              value={v.cashFlow ?? ""}
              onChange={(e) =>
                change(
                  "cashFlow",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="Рост потока в год, %">
            <input
              type="number"
              step="any"
              min="-90"
              max="100"
              value={v.growth}
              onChange={(e) => change("growth", Number(e.target.value))}
            />
          </Field>
          <Field
            label="Требуемая доходность акционера, %"
            hint="Стоимость собственного капитала, не WACC"
          >
            <input
              type="number"
              min="0.1"
              max="100"
              step="any"
              value={v.discount}
              onChange={(e) => change("discount", Number(e.target.value))}
            />
          </Field>
          <Field label="Долгосрочный рост, %">
            <input
              type="number"
              min="-20"
              max="20"
              step="any"
              value={v.terminalGrowth}
              onChange={(e) => change("terminalGrowth", Number(e.target.value))}
            />
          </Field>
          <Field label="Прогнозный период, лет">
            <input
              type="number"
              min="1"
              max="10"
              value={v.years}
              onChange={(e) => change("years", Number(e.target.value))}
            />
          </Field>
          <Field label="Требуемый запас прочности, %">
            <input
              type="number"
              min="0"
              max="90"
              step="any"
              value={v.margin}
              onChange={(e) => change("margin", Number(e.target.value))}
            />
          </Field>
          <Field label="Обоснование допущений">
            <input
              maxLength={2000}
              value={v.source}
              onChange={(e) => change("source", e.target.value)}
              placeholder="Отчёт, прогноз, причины выбора ставок"
            />
          </Field>
        </div>
        <p className="footnote">
          FCFE учитывает инвестиции, оборотный капитал и чистое заимствование.
          «Операционный поток − CAPEX» сам по себе не равен FCFE. Денежный поток
          и ставка должны быть в одной валюте и в одинаковом выражении
          (номинальном или реальном).
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button secondary" disabled={busy}>
          Сохранить допущения
        </button>
      </form>
      {!base ? (
        <div className="notice">
          Для оценки нужен положительный годовой поток. Требуемая доходность
          должна превышать долгосрочный рост. Модель не подходит для
          отрицательных потоков и компаний, требующих отдельного прогноза выхода
          из убытков.
        </div>
      ) : (
        <>
          <div className="analysis-metrics">
            <Metric
              label="Стоимость по модели"
              value={moneyLabel(base.value)}
              hint="На одну акцию, базовый сценарий"
            />
            <Metric
              label="Цена с запасом прочности"
              value={moneyLabel(base.value * (1 - v.margin / 100))}
              hint={`Скидка ${num(v.margin)}% к модельной стоимости`}
            />
            <Metric
              label="Отличие от цены анализа"
              value={
                price ? `${num((base.value / price - 1) * 100)}%` : "Нет цены"
              }
              hint="Не прогноз годовой доходности"
            />
          </div>
          <section>
            <h3>Сценарии стоимости</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Сценарий</th>
                    <th>Рост / ставка</th>
                    <th>Стоимость</th>
                    <th>К цене анализа</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => {
                    const result = equityValue({ ...v, ...s });
                    return (
                      <tr key={s.label}>
                        <td>{s.label}</td>
                        <td>
                          {num(s.growth)}% / {num(s.discount)}%
                        </td>
                        <td>{moneyLabel(result?.value ?? null)}</td>
                        <td>
                          {result && price
                            ? `${num((result.value / price - 1) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="footnote">
              Иллюстративный стресс-тест: рост ±5 п.п., ставка ∓2 п.п. Это не
              вероятности исходов.
            </p>
          </section>
          <div className="notice">
            <strong>
              Обратный DCF:{" "}
              {reverse === null
                ? "нет решения в диапазоне −90…100%"
                : `${num(reverse)}% роста в год`}
            </strong>
            <br />
            Такой рост в течение {v.years} лет соответствует цене анализа при
            остальных базовых допущениях. {num(base.terminalShare * 100)}%
            оценки приходится на стоимость после прогнозного периода.
            {base.terminalShare > 0.7 &&
              " Оценка сильно зависит от дальнего будущего."}
          </div>
          <details>
            <summary>Чувствительность к ставке и долгосрочному росту</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ставка / рост</th>
                    {[-1, 0, 1].map((d) => (
                      <th key={d}>{num(v.terminalGrowth + d)}%</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[-2, 0, 2].map((d) => (
                    <tr key={d}>
                      <td>{num(v.discount + d)}%</td>
                      {[-1, 0, 1].map((g) => (
                        <td key={g}>
                          {moneyLabel(
                            equityValue({
                              ...v,
                              discount: v.discount + d,
                              terminalGrowth: v.terminalGrowth + g,
                            })?.value ?? null,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Прогноз потоков на акцию</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Год</th>
                    <th>Поток</th>
                  </tr>
                </thead>
                <tbody>
                  {base.flows.map((f) => (
                    <tr key={f.year}>
                      <td>{f.year}</td>
                      <td>{moneyLabel(f.flow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
