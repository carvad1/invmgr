import { useState, type FormEvent } from "react";
import { AlertCircle, Check, Plus } from "lucide-react";
import {
  currencies,
  kinds,
  kindLabels,
  operationLabels,
  emptyThesis,
  today,
  type Instrument,
  type Operation,
  type State,
  type SaveOperation,
  type Quote,
  type FxRate,
} from "../domain/types";
import { fxAt } from "../domain/finance";
import { Field, money, Modal } from "./ui";

const n = (form: FormData, key: string) =>
  Number(String(form.get(key) ?? "").replace(",", "."));
const s = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) =>
  s(form, key) === "" ? null : n(form, key);
export function InstrumentForm({
  value,
  locked,
  save,
  close,
}: {
  value: Instrument;
  locked: boolean;
  save: (i: Instrument, buy: boolean) => Promise<void>;
  close: () => void;
}) {
  const [kind, setKind] = useState(value.kind);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const buy =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "buy";
    const i: Instrument = {
      ...value,
      kind,
      name: s(f, "name"),
      ticker: s(f, "ticker"),
      provider: locked ? value.provider : s(f, "provider"),
      currency: locked
        ? value.currency
        : (s(f, "currency") as Instrument["currency"]),
      nominal: kind === "deposit" ? 1 : n(f, "nominal"),
      annualRate: n(f, "annualRate"),
      maturity: s(f, "maturity"),
      frequency: n(f, "frequency"),
      nextPayment: s(f, "nextPayment"),
      capitalization: f.get("capitalization") === "on",
      notes: s(f, "notes"),
      sourceUrl: s(f, "sourceUrl"),
      eps: optional(f, "eps"),
      bookValue: optional(f, "bookValue"),
      debt: optional(f, "debt"),
      equity: optional(f, "equity"),
      revenue: optional(f, "revenue"),
      netIncome: optional(f, "netIncome"),
      reportDate: s(f, "reportDate"),
    };
    setBusy(true);
    setError("");
    try {
      await save(i, buy);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={value.name ? "Карточка инструмента" : "Новый инструмент"}
      subtitle="Сохраните условия. Сумму покупки внесём отдельной операцией."
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Тип актива">
            <select
              value={kind}
              disabled={locked}
              onChange={(e) => setKind(e.target.value as Instrument["kind"])}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabels[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Название">
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={value.name}
              placeholder="Например, мой вклад в BYN"
              autoFocus
            />
          </Field>
          <Field label="Банк / площадка / счёт">
            <input
              name="provider"
              list="providers"
              required
              defaultValue={value.provider}
              disabled={locked}
            />
            <datalist id="providers">
              <option>Банк</option>
              <option>Finstore</option>
              <option>Aigenis</option>
            </datalist>
          </Field>
          <Field label="Валюта">
            <select
              name="currency"
              defaultValue={value.currency}
              disabled={locked}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {kind !== "deposit" && (
            <>
              <Field label="Тикер / номер выпуска">
                <input
                  name="ticker"
                  defaultValue={value.ticker}
                  placeholder="Уникальный выпуск"
                />
              </Field>
              <Field label="Номинал единицы">
                <input
                  name="nominal"
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  defaultValue={value.nominal}
                />
              </Field>
            </>
          )}
          {kind !== "stock" && (
            <>
              <Field label="Ставка, % годовых">
                <input
                  name="annualRate"
                  type="number"
                  min="0"
                  max="1000"
                  step="any"
                  defaultValue={value.annualRate}
                />
              </Field>
              <Field label="Дата погашения / окончания">
                <input
                  name="maturity"
                  type="date"
                  defaultValue={value.maturity}
                />
              </Field>
              <Field label="Периодичность выплат">
                <select name="frequency" defaultValue={value.frequency}>
                  <option value="0">По условиям договора / неизвестна</option>
                  <option value="12">Каждый месяц</option>
                  <option value="4">Каждый квартал</option>
                  <option value="2">Раз в полгода</option>
                  <option value="1">Раз в год</option>
                </select>
              </Field>
              <Field
                label="Ближайшая дата выплаты"
                hint="Нужна для прогноза регулярных платежей"
              >
                <input
                  name="nextPayment"
                  type="date"
                  defaultValue={value.nextPayment}
                />
              </Field>
              {kind === "deposit" && (
                <label className="check-field wide">
                  <input
                    type="checkbox"
                    name="capitalization"
                    defaultChecked={value.capitalization}
                  />{" "}
                  Ежемесячная капитализация в прогнозе
                </label>
              )}
            </>
          )}
          <Field label="Условия и заметки" wide>
            <textarea
              name="notes"
              defaultValue={value.notes}
              placeholder="Досрочный выход, ограничения, гарантии, условия начисления…"
            />
          </Field>
          <Field label="Ссылка на официальный источник" wide>
            <input
              type="url"
              name="sourceUrl"
              defaultValue={value.sourceUrl}
              placeholder="https://…"
            />
          </Field>
        </div>
        <details className="form-details">
          <summary>Отчётность эмитента для анализа</summary>
          <p>
            Все суммы — в валюте инструмента, за один отчётный период.
            Неизвестные поля оставьте пустыми.
          </p>
          <div className="form-grid">
            <Field label="Дата отчётности">
              <input
                type="date"
                name="reportDate"
                defaultValue={value.reportDate}
              />
            </Field>
            {(
              [
                ["eps", "Прибыль на акцию"],
                ["bookValue", "Балансовая стоимость на акцию"],
                ["debt", "Долг"],
                ["equity", "Собственный капитал"],
                ["revenue", "Выручка за год"],
                ["netIncome", "Чистая прибыль за год"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  name={key}
                  type="number"
                  step="any"
                  defaultValue={value[key] ?? ""}
                />
              </Field>
            ))}
          </div>
        </details>
        {error && (
          <p role="alert" className="form-error">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button type="button" className="button ghost" onClick={close}>
            Отмена
          </button>
          <button className="button secondary" disabled={busy} value="save">
            <Check size={16} />
            Сохранить
          </button>
          {!locked && (
            <button className="button primary" disabled={busy} value="buy">
              <Plus size={16} />
              Сохранить и внести покупку
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
export function OperationForm({
  state,
  initialInstrument,
  existing,
  save,
  close,
}: {
  state: State;
  initialInstrument?: string;
  existing?: Operation;
  save: (v: SaveOperation) => Promise<void>;
  close: () => void;
}) {
  const [kind, setKind] = useState<Operation["kind"]>(
    existing?.kind ?? (initialInstrument ? "buy" : "deposit"),
  );
  const [instrumentId, setInstrumentId] = useState(
    existing?.instrumentId ??
      initialInstrument ??
      state.instruments[0]?.id ??
      "",
  );
  const instrument = state.instruments.find((i) => i.id === instrumentId);
  const assetOperation = ["buy", "sell", "income"].includes(kind);
  const [currency, setCurrency] = useState(existing?.currency ?? "BYN");
  const selectedCurrency = assetOperation
    ? (instrument?.currency ?? "BYN")
    : currency;
  const [date, setDate] = useState(existing?.date ?? today());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isDeposit = instrument?.kind === "deposit";
  const thesis = existing?.thesis ?? emptyThesis();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const o: Operation = {
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      instrumentId: assetOperation ? instrumentId : "",
      kind,
      date,
      provider: assetOperation ? instrument!.provider : s(f, "provider"),
      currency: selectedCurrency,
      quantity: ["buy", "sell"].includes(kind) ? n(f, "quantity") : 0,
      price: ["buy", "sell"].includes(kind)
        ? isDeposit
          ? 1
          : n(f, "price")
        : 0,
      amount: ["buy", "sell"].includes(kind) ? 0 : n(f, "amount"),
      fee: n(f, "fee"),
      fx: selectedCurrency === "BYN" ? 1 : n(f, "fx"),
      note: s(f, "note"),
      thesis:
        kind === "buy"
          ? {
              reason: s(f, "reason"),
              goal: s(f, "goal"),
              horizon: s(f, "horizon"),
              expectation: s(f, "expectation"),
              risks: s(f, "risks"),
              exit: s(f, "exit"),
            }
          : emptyThesis(),
    };
    setBusy(true);
    setError("");
    try {
      await save({ operation: o, fundFromOutside: f.get("fund") === "on" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={existing ? "Редактировать операцию" : "Добавить операцию"}
      subtitle="Запишите совершённую операцию. Прогнозы не увеличивают фактический доход."
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Операция">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Operation["kind"])}
            >
              {Object.entries(operationLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата операции">
            <input
              type="date"
              value={date}
              max={today()}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {assetOperation ? (
            <Field label="Инструмент" wide>
              <select
                required
                value={instrumentId}
                onChange={(e) => setInstrumentId(e.target.value)}
              >
                <option value="">Выберите инструмент</option>
                {state.instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.provider} · {i.currency}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Счёт / площадка">
                <input
                  name="provider"
                  defaultValue={existing?.provider ?? "Банк"}
                  required
                  list="account-list"
                />
                <datalist id="account-list">
                  {[
                    ...new Set([
                      "Банк",
                      "Finstore",
                      "Aigenis",
                      ...state.instruments.map((i) => i.provider),
                      ...state.operations.map((o) => o.provider),
                    ]),
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </datalist>
              </Field>
              <Field label="Валюта">
                <select
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as typeof currency)
                  }
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {["buy", "sell"].includes(kind) ? (
            <>
              <Field
                label={
                  isDeposit
                    ? `Сумма вклада / погашения, ${selectedCurrency}`
                    : "Количество"
                }
              >
                <input
                  name="quantity"
                  type="number"
                  step="any"
                  min="0.00000001"
                  required
                  defaultValue={existing?.quantity ?? ""}
                />
              </Field>
              {!isDeposit && (
                <Field
                  label={`Цена за единицу, ${selectedCurrency}`}
                  hint="Для облигации укажите полную цену с НКД"
                >
                  <input
                    key={instrumentId}
                    name="price"
                    type="number"
                    step="any"
                    min="0.00000001"
                    required
                    defaultValue={existing?.price ?? instrument?.nominal ?? ""}
                  />
                </Field>
              )}
            </>
          ) : (
            <Field label={`Сумма, ${selectedCurrency}`}>
              <input
                name="amount"
                type="number"
                step="any"
                min="0.00000001"
                required
                defaultValue={existing?.amount ?? ""}
              />
            </Field>
          )}
          <Field label={`Комиссия, ${selectedCurrency}`}>
            <input
              name="fee"
              type="number"
              step="any"
              min="0"
              required
              defaultValue={existing?.fee ?? 0}
            />
          </Field>
          {selectedCurrency !== "BYN" && (
            <Field
              label={`Фактический курс: BYN за 1 ${selectedCurrency}`}
              hint="Проверьте курс именно на дату операции"
            >
              <input
                key={`${selectedCurrency}:${date}`}
                name="fx"
                type="number"
                step="any"
                min="0.00000001"
                required
                defaultValue={
                  existing?.fx ??
                  fxAt(state, selectedCurrency, date)?.rate ??
                  ""
                }
              />
            </Field>
          )}
          {kind === "buy" && (
            <label className="check-field wide">
              <input
                name="fund"
                type="checkbox"
                defaultChecked={
                  !existing ||
                  state.operations.some((o) => o.linkedId === existing.id)
                }
              />{" "}
              Сумма покупки и комиссия внесены извне{" "}
              <small>
                Создать связанное пополнение. Снимите отметку, если деньги уже
                есть на счёте.
              </small>
            </label>
          )}
          {kind === "buy" && (
            <>
              <div className="form-divider wide">Инвестиционная идея</div>
              <Field label="Почему покупаю" wide>
                <textarea
                  name="reason"
                  required
                  defaultValue={thesis.reason}
                  placeholder="На чём основано моё решение?"
                />
              </Field>
              {(
                [
                  ["goal", "Цель"],
                  ["horizon", "Срок владения"],
                  ["expectation", "Ожидаемый результат"],
                  ["risks", "Какие риски принимаю"],
                  ["exit", "Когда продам / пересмотрю решение"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} wide={key === "exit"}>
                  <input name={key} defaultValue={thesis[key]} />
                </Field>
              ))}
            </>
          )}
          <Field label="Комментарий" wide>
            <textarea
              name="note"
              defaultValue={existing?.note ?? ""}
              placeholder={
                kind === "income"
                  ? "Например, проценты по вкладу за сентябрь"
                  : ""
              }
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="form-error">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button type="button" className="button ghost" onClick={close}>
            Отмена
          </button>
          <button
            className="button primary"
            disabled={busy || (assetOperation && !instrument)}
          >
            Сохранить операцию
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function QuoteForm({
  instrument,
  save,
  close,
}: {
  instrument: Instrument;
  save: (q: Quote) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Добавить цену" subtitle={instrument.name} close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await save({
              id: crypto.randomUUID(),
              instrumentId: instrument.id,
              price: n(f, "price"),
              date: s(f, "date"),
              source: s(f, "source"),
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label={`Цена, ${instrument.currency}`}>
            <input
              type="number"
              name="price"
              min="0.00000001"
              step="any"
              required
              autoFocus
            />
          </Field>
          <Field label="Дата цены">
            <input
              type="date"
              name="date"
              required
              max={today()}
              defaultValue={today()}
            />
          </Field>
          <Field label="Источник цены" wide>
            <input name="source" required defaultValue="Ручной ввод" />
          </Field>
        </div>
        <p className="muted">
          Одна цена в день. Повторное сохранение обновляет цену выбранного дня.
          Для облигаций используйте полную цену с НКД.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button className="button primary" disabled={busy}>
            Сохранить цену
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function FxForm({
  save,
  close,
}: {
  save: (f: FxRate) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Курс валюты"
      subtitle="Стоимость одной единицы валюты в белорусских рублях"
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await save({
              currency: s(f, "currency") as FxRate["currency"],
              date: s(f, "date"),
              rate: n(f, "rate"),
              source: "Ручной ввод",
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Валюта">
            <select name="currency">
              {currencies
                .filter((c) => c !== "BYN")
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </Field>
          <Field label="Дата">
            <input
              type="date"
              name="date"
              defaultValue={today()}
              max={today()}
              required
            />
          </Field>
          <Field label="BYN за одну единицу">
            <input
              name="rate"
              type="number"
              step="any"
              min="0.00000001"
              required
              autoFocus
            />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button className="button primary" disabled={busy}>
            Сохранить курс
          </button>
        </footer>
      </form>
    </Modal>
  );
}
