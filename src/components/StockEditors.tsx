import { useState, type FormEvent } from "react";
import { currencies, today, type Instrument } from "../domain/types";
import {
  emptyStockAnalysis,
  stockReportSchema,
  type StockReport,
} from "../domain/stock-schema";
import { parseStockHistory } from "../domain/stocks";
import { Field, Modal } from "./ui";

export const reportFields = [
  ["revenue", "Выручка"],
  ["netIncome", "Чистая прибыль акционеров"],
  ["equity", "Собственный капитал акционеров"],
  ["debt", "Процентный долг"],
  ["cash", "Денежные средства"],
  ["ebitda", "EBITDA"],
  ["operatingCashFlow", "Операционный денежный поток"],
  ["capex", "Капитальные затраты (положительные)"],
  ["shares", "Акций в обращении, шт."],
  ["eps", "Разводнённая прибыль на акцию (EPS)"],
  ["bookValue", "Балансовая стоимость на акцию"],
  ["dividend", "Выплаченный дивиденд на акцию"],
] as const;
type Props = {
  instrument: Instrument;
  save: (i: Instrument) => Promise<void>;
  close: () => void;
};
export function StockReportEditor({
  instrument: i,
  report,
  save,
  close,
}: Props & { report?: StockReport }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = i.stockAnalysis ?? emptyStockAnalysis();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(e.currentTarget);
      const r = stockReportSchema.parse({
        date: data.get("date"),
        currency: data.get("currency"),
        source: data.get("source"),
        ...Object.fromEntries(
          reportFields.map(([key]) => [
            key,
            String(data.get(key) ?? "").trim() === ""
              ? null
              : Number(data.get(key)),
          ]),
        ),
      });
      await save({
        ...i,
        stockAnalysis: {
          ...profile,
          description: String(data.get("description") ?? ""),
          sector: String(data.get("sector") ?? ""),
          reports: [
            ...profile.reports.filter(
              (v) => v.date !== r.date && v.date !== report?.date,
            ),
            r,
          ].sort((a, b) => b.date.localeCompare(a.date)),
        },
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={report ? "Изменить отчёт" : "Добавить отчёт"}
      subtitle="Прибыль и потоки — за полные 12 месяцев. Балансовые показатели — на конец периода."
      close={close}
    >
      <form onSubmit={(e) => void submit(e)}>
        <div className="notice">
          Суммы в единицах выбранной валюты, не в тысячах или миллионах. Все
          данные должны относиться к одной компании и классу акций. Неизвестное
          оставляйте пустым.
        </div>
        <div className="form-grid">
          <Field label="Конец 12-месячного периода">
            <input
              required
              type="date"
              name="date"
              max={today()}
              defaultValue={report?.date ?? ""}
            />
          </Field>
          <Field label="Валюта отчётности">
            <select
              name="currency"
              defaultValue={report?.currency ?? i.currency}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Источник отчётности"
            wide
            hint="Ссылка на отчёт или название документа и страницы"
          >
            <input
              required
              name="source"
              maxLength={2000}
              defaultValue={report?.source ?? ""}
            />
          </Field>
          {reportFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="any"
                name={key}
                defaultValue={report?.[key] ?? ""}
              />
            </Field>
          ))}
        </div>
        <details>
          <summary>О компании</summary>
          <div className="form-grid">
            <Field label="Отрасль">
              <input
                name="sector"
                maxLength={200}
                defaultValue={profile.sector}
              />
            </Field>
            <Field label="Бизнес и инвестиционная идея" wide>
              <textarea
                name="description"
                maxLength={5000}
                defaultValue={profile.description}
              />
            </Field>
          </div>
        </details>
        <p className="footnote">
          EPS и балансовая стоимость на акцию имеют приоритет над расчётом через
          число акций. Для нескольких классов акций капитализация и EV требуют
          отдельной корректировки.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button type="button" className="button secondary" onClick={close}>
            Отмена
          </button>
          <button disabled={busy} className="button primary">
            Сохранить отчёт
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function StockHistoryEditor({ instrument: i, save, close }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const p = i.stockAnalysis ?? emptyStockAnalysis();
  return (
    <Modal
      title="История цен акции"
      subtitle="Даты и цены закрытия в валюте акции. До 5000 строк."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const history = parseStockHistory(String(f.get("history")));
            await save({
              ...i,
              stockAnalysis: {
                ...p,
                history,
                historySource: String(f.get("source")),
                adjusted: f.get("adjusted") === "on",
              },
            });
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Источник истории">
          <input
            name="source"
            required
            maxLength={2000}
            defaultValue={p.historySource}
          />
        </Field>
        <Field
          label="История: дата;цена"
          hint="Например: 2026-09-25;125.50. Повторяющиеся даты не допускаются."
        >
          <textarea
            className="paste-area"
            name="history"
            required
            defaultValue={p.history
              .map((r) => `${r.date};${r.close}`)
              .join("\n")}
            placeholder="2026-09-25;125.50"
          />
        </Field>
        <label className="stock-check">
          <input type="checkbox" name="adjusted" defaultChecked={p.adjusted} />{" "}
          Цены скорректированы на дробления и дивиденды
        </label>
        <p className="footnote">
          Список заменит прежнюю историю только этой акции. Котировки портфеля
          остаются отдельными. SMA и RSI считаются по наблюдениям; нерегулярные
          сделки не превращаются в дневной ряд.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button className="button primary" disabled={busy}>
            Сохранить историю
          </button>
        </footer>
      </form>
    </Modal>
  );
}
