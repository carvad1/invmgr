import { lazy, Suspense, useMemo, useState } from "react";
import type { Instrument, State } from "../domain/types";
import { today } from "../domain/types";
import { emptyStockAnalysis, type StockReport } from "../domain/stock-schema";
import {
  latestStockReport,
  stockMetrics,
  stockPrice,
  stockQuality,
  stockTechnicals,
} from "../domain/stocks";
import {
  Empty,
  Field,
  Metric,
  Modal,
  dateLabel,
  money,
  num,
} from "../components/ui";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import {
  reportFields,
  StockHistoryEditor,
  StockReportEditor,
} from "../components/StockEditors";
import StockValuation from "../components/StockValuation";
import StockMarketData from "../components/StockMarketData";
import StockWebResearch, {
  StockWebStatus,
  StockWebSummary,
} from "../components/StockWebResearch";
import {
  isBankStock,
  latestWebDividend,
  webDividendYield,
} from "../domain/stock-web";
import {
  importStockResponses,
  terminalPriceHistory,
} from "../domain/stock-import";
import type { WorkspaceActions } from "../components/workspace";
const StockChart = lazy(() => import("../components/StockChart"));
const pct = (v: number | null) => (v === null ? "—" : `${num(v * 100)}%`);
const tabs = [
  ["summary", "Обзор"],
  ["valuation", "Оценка стоимости"],
  ["reports", "Отчётность"],
  ["history", "Цена и риск"],
  ["data", "Данные и методика"],
] as const;
type Tab = (typeof tabs)[number][0];
type Props = {
  state: State;
  selected: string;
  select: (id: string) => void;
  save: (i: Instrument) => Promise<void>;
  actions: WorkspaceActions;
  openSource: (url: string) => void;
  refreshStocks: (id?: string, force?: boolean) => Promise<void>;
  stockBusy: boolean;
  readDocument: (id: string, documentId: string) => Promise<void>;
};

export default function Stocks(props: Props) {
  const { state, selected, select, save } = props;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(
    () =>
      state.instruments
        .filter(
          (i) =>
            i.kind === "stock" &&
            `${i.name} ${i.ticker} ${i.stockAnalysis?.market?.issuer ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .map((i) => {
          const price = stockPrice(i, state.quotes);
          const r = latestStockReport(i);
          return { i, price, r };
        })
        .sort((a, b) =>
          sort === "name"
            ? a.i.name.localeCompare(b.i.name, "ru")
            : sort === "trades"
              ? (b.i.stockAnalysis?.terminal?.stats.num_deals_30days ?? -1) -
                (a.i.stockAnalysis?.terminal?.stats.num_deals_30days ?? -1)
              : (b.i.stockAnalysis?.terminal?.stats.turnover_byn_30days ?? -1) -
                (a.i.stockAnalysis?.terminal?.stats.turnover_byn_30days ?? -1),
        ),
    [state.instruments, state.quotes, query, sort],
  );
  const current = state.instruments.find(
    (i) => i.kind === "stock" && i.id === selected,
  );
  const actualPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  );
  return (
    <div className="page-stack">
      {current ? (
        <StockDetail
          key={current.id}
          {...props}
          instrument={current}
          back={() => select("")}
          importData={() => {
            setError("");
            setImporting(true);
          }}
        />
      ) : (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Список наблюдения</h2>
              <p>Цена, бизнес и стоимость акции в одной карточке</p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setImporting(true);
              }}
            >
              Вставить из Aigenis
            </button>
          </div>
          <div className="toolbar">
            <input
              aria-label="Поиск акции"
              placeholder="Компания или тикер"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Сортировка акций"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="name">По названию</option>
              <option value="trades">Больше сделок за 30 дней</option>
              <option value="turnover">Больше оборот за 30 дней</option>
            </select>
          </div>
          <div className="section-heading">
            <p className="footnote" role="status">
              {props.stockBusy
                ? "Собираем отчётность и выплаты…"
                : "Официальные документы и выплаты обновляются в фоне"}
            </p>
            <button
              className="text-button"
              disabled={props.stockBusy}
              onClick={() => void props.refreshStocks(undefined, true)}
            >
              Обновить все акции
            </button>
          </div>
          {!rows.length ? (
            <Empty
              title="Добавьте первую акцию"
              description="Откройте акцию в Aigenis, скопируйте её обновлённым расширением и вставьте сюда. Можно также добавить акцию вручную. Отчётность дополняется в карточке."
            />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Компания</th>
                      <th>Цена анализа</th>
                      <th>Сделок за 30 дней</th>
                      <th>Оборот за 30 дней</th>
                      <th>Выплата / цена</th>
                      <th>Документы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(
                        actualPage * PAGE_SIZE,
                        (actualPage + 1) * PAGE_SIZE,
                      )
                      .map(({ i, price, r }) => (
                        <tr key={i.id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => select(i.id)}
                            >
                              {i.name}
                            </button>
                            <small className="stock-sub">
                              {i.ticker} · {i.currency}
                            </small>
                          </td>
                          <td>
                            {money(price.value, i.currency)}
                            <small className="stock-sub">{price.label}</small>
                          </td>
                          <td>
                            {num(
                              i.stockAnalysis?.terminal?.stats
                                .num_deals_30days ?? null,
                              0,
                            )}
                          </td>
                          <td>
                            {money(
                              i.stockAnalysis?.terminal?.stats
                                .turnover_byn_30days ?? null,
                              "BYN",
                            )}
                          </td>
                          <td>
                            {pct(webDividendYield(i, price.value))}
                            <small className="stock-sub">
                              {latestWebDividend(i)
                                ? `За ${latestWebDividend(i)!.earningsYear} год`
                                : "Нет подтверждённой выплаты"}
                            </small>
                          </td>
                          <td>
                            {i.stockAnalysis?.web?.documents.length ?? 0}
                            <small className="stock-sub">
                              {r
                                ? `Отчёт: ${dateLabel(r.date)}`
                                : i.stockAnalysis?.web
                                  ? "Официальные источники"
                                  : "Ещё не загружены"}
                            </small>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                count={rows.length}
                page={actualPage}
                change={setPage}
              />
            </>
          )}
          <p className="footnote">
            Список сохраняется на компьютере. Импорт не записывает покупки.
            Дивидендная доходность — по прошлым выплатам, до налогов и комиссий.
          </p>
        </section>
      )}
      {importing && (
        <Modal
          title="Вставить акции из Aigenis"
          subtitle="Карточка, история и статистика — одной вставкой или несколькими файлами"
          close={() => {
            if (!busy) setImporting(false);
          }}
        >
          <Field label="JSON карточек акций">
            <textarea
              autoFocus
              className="paste-area"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{"results": […]}'
            />
          </Field>
          <Field label="Или выбрать файлы ответов (.json, .txt)">
            <input
              type="file"
              multiple
              accept=".json,.txt,application/json,text/plain"
              disabled={busy}
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                if (!files.length) return;
                setError("");
                setBusy(true);
                try {
                  if (files.reduce((n, f) => n + f.size, 0) > 2_000_000)
                    throw new Error("Максимум 2 МБ за импорт");
                  setRaw(
                    (await Promise.all(files.map((f) => f.text()))).join(
                      "\n\n",
                    ),
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Field>
          <p className="footnote">
            Можно вставить несколько JSON подряд: карточку security_definition,
            историю trade_stat и статистику definition_stat. Порядок не важен.
            Только Response без Authorization и Cookie. Данные дополнят
            существующую акцию.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="form-footer">
            <button
              className="button primary"
              disabled={busy || !raw.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const parsed = importStockResponses(
                    raw,
                    state.instruments,
                  ).instruments;
                  let first = "";
                  for (const i of parsed) {
                    await save(i);
                    first ||= i.id;
                  }
                  setRaw("");
                  setImporting(false);
                  setQuery("");
                  setPage(0);
                  select(parsed.length === 1 ? first : "");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Сохраняем…" : "Добавить акции"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function StockDetail({
  instrument: i,
  state,
  save,
  actions,
  openSource,
  back,
  importData,
  refreshStocks,
  stockBusy,
  readDocument,
}: Props & {
  instrument: Instrument;
  back: () => void;
  importData: () => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [editReport, setEditReport] = useState<StockReport | "new" | null>(
    null,
  );
  const [historyEditor, setHistoryEditor] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const profile = i.stockAnalysis ?? emptyStockAnalysis();
  const market = profile.market;
  const importedHistory = useMemo(
    () => terminalPriceHistory(profile),
    [profile],
  );
  const priceHistory = profile.history.length
    ? profile.history
    : importedHistory;
  const historyProfile = {
    ...profile,
    history: priceHistory,
    adjusted: profile.history.length ? profile.adjusted : false,
    historySource: profile.history.length
      ? profile.historySource
      : "Aigenis · средневзвешенные цены торговых дней",
  };
  const defaultPrice = stockPrice(i, state.quotes);
  const price = customPrice.trim()
    ? Number(customPrice) > 0 && Number.isFinite(Number(customPrice))
      ? Number(customPrice)
      : null
    : defaultPrice.value;
  const report = latestStockReport(i);
  const previous = profile.reports
    .filter((r) => r.currency === report?.currency && r.date < report.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const m = stockMetrics(report, price);
  const quality = stockQuality(report, previous);
  const bank = isBankStock(i);
  const evaluated = quality.filter((q) => q.pass !== null).length;
  const passed = quality.filter((q) => q.pass === true).length;
  const spread =
    market?.ask && market.bid && market.ask >= market.bid
      ? (market.ask - market.bid) / ((market.ask + market.bid) / 2)
      : null;
  const age = report
    ? Math.floor((Date.parse(today()) - Date.parse(report.date)) / 86400000)
    : null;
  const metrics: [string, number | null, string][] = [
    ["P/E", m.pe, "Цена / положительная прибыль на акцию"],
    ["P/B", m.pb, "Цена / положительный капитал на акцию"],
    [
      "EV / EBITDA",
      m.evEbitda,
      "(Капитализация + долг − деньги) / EBITDA; упрощённый EV, один класс акций",
    ],
    [
      "Долг / капитал",
      m.debtEquity,
      "Процентный долг / положительный собственный капитал",
    ],
    [
      "Чистый долг / EBITDA",
      m.netDebtEbitda,
      "(Процентный долг − деньги) / положительная EBITDA",
    ],
    [
      "Денежное покрытие прибыли",
      m.cashConversion,
      "Операционный денежный поток / положительная чистая прибыль",
    ],
  ];
  return (
    <>
      <div className="button-row">
        <button className="text-button" onClick={back}>
          ← Все акции
        </button>
        <button className="button secondary small" onClick={importData}>
          Вставить из Aigenis
        </button>
        <button
          className="button secondary small"
          onClick={() => actions.edit(i)}
        >
          Изменить акцию
        </button>
        <button
          className="button secondary small"
          onClick={() => actions.buy(i.id)}
        >
          Записать операцию
        </button>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{i.name}</h2>
            <p>
              {market?.issuer || i.ticker}{" "}
              {profile.sector && `· ${profile.sector}`}
            </p>
          </div>
          <span className="badge">{i.currency}</span>
        </div>
        <div className="stock-price-row">
          <div>
            <span className="muted">Цена для анализа</span>
            <h2>{money(price, i.currency)}</h2>
            <small>
              {customPrice ? "Ваша цена для сценария" : defaultPrice.label} ·{" "}
              {customPrice
                ? "без изменения котировок"
                : defaultPrice.date
                  ? dateLabel(defaultPrice.date)
                  : "дата цены неизвестна"}
            </small>
          </div>
          <Field label="Своя цена, необязательно">
            <input
              type="number"
              min="0.000001"
              step="any"
              placeholder="Из Aigenis / последняя сделка"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
            />
          </Field>
        </div>
        {market?.warning && (
          <details className="notice">
            <summary>Сообщение Aigenis об эмитенте</summary>
            <p>{market.warning}</p>
          </details>
        )}
        {market && (
          <p className="footnote">
            Импортировано {dateLabel(market.capturedAt)}. Предложение и
            последняя сделка могут устареть; наличие бумаги проверяется в
            терминале. Время импорта и обновления торгового статуса не считаются
            датой сделки.
          </p>
        )}
        <div className="tabs stock-tabs" aria-label="Карточка акции">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <StockWebStatus
          instrument={i}
          busy={stockBusy}
          refresh={() => void refreshStocks(i.id, true)}
          save={save}
        />
        {tab === "summary" && (
          <div className="page-stack">
            <StockWebSummary
              instrument={i}
              price={price}
              showReports={() => setTab("reports")}
            />
            <StockMarketData
              profile={profile}
              showHistory={() => setTab("history")}
            />
            {report && (
              <div className="analysis-metrics">
                <Metric
                  label="P/E"
                  value={num(m.pe)}
                  hint="Цена / прибыль; убыток не считается дешёвым P/E"
                />
                <Metric
                  label="Дивидендная доходность"
                  value={pct(m.dividendYield)}
                  hint="Прошлые 12 месяцев, до налогов и комиссий"
                />
                <Metric
                  label="Сигналы качества"
                  value={
                    bank
                      ? "Банковская специфика"
                      : evaluated
                        ? `${passed} из ${evaluated}`
                        : "Нет отчётности"
                  }
                  hint={`Проверено ${evaluated} из 5 критериев; это не кредитный рейтинг`}
                />
              </div>
            )}
            {(!report || (age !== null && age > 450)) && (
              <div className="notice">
                {report
                  ? `Отчётности ${age} дней. Выводы могут быть устаревшими.`
                  : "Для P/E и оценки бизнеса нужны подтверждённые показатели прибыли и капитала. Найденные документы доступны во вкладке «Отчётность»."}{" "}
                <button
                  className="text-button"
                  onClick={() => setEditReport("new")}
                >
                  Добавить отчёт
                </button>
              </div>
            )}
            {profile.description && (
              <p className="stock-prose">{profile.description}</p>
            )}
            {report &&
              ((report.netIncome !== null && report.netIncome <= 0) ||
                (report.equity !== null && report.equity <= 0) ||
                (m.payout !== null && m.payout > 1)) && (
                <div className="notice warning">
                  {report.netIncome !== null &&
                    report.netIncome <= 0 &&
                    "Нет положительной чистой прибыли. "}
                  {report.equity !== null &&
                    report.equity <= 0 &&
                    "Собственный капитал неположительный. "}
                  {m.payout !== null &&
                    m.payout > 1 &&
                    "Дивиденды превышают прибыль на акцию за период. "}
                  Положительные сигналы по другим критериям не устраняют эти
                  риски.
                </div>
              )}
            {report && (
              <>
                {!bank && (
                  <section>
                    <h3>Качество бизнеса</h3>
                    <div className="stock-quality">
                      {quality.map((q) => (
                        <div key={q.label}>
                          <strong>
                            {q.pass === null ? "○" : q.pass ? "✓" : "!"}{" "}
                            {q.label}
                          </strong>
                          <span>
                            {q.pass === null
                              ? "Недостаточно данных"
                              : q.pass
                                ? "Критерий выполнен"
                                : "Требует внимания"}
                          </span>
                          <small>{q.rule}</small>
                        </div>
                      ))}
                    </div>
                    <p className="footnote">
                      Прозрачные эвристики для нефинансовых компаний. Пороги не
                      являются отраслевыми нормами или рейтингом MSCI. У банков,
                      страховщиков и холдингов нужна специальная оценка.
                    </p>
                  </section>
                )}
                <section>
                  <h3>Мультипликаторы и финансовые показатели</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Показатель</th>
                          <th>Значение</th>
                          <th>Основание</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map(([label, value, hint]) => (
                          <tr key={label}>
                            <td>{label}</td>
                            <td>{num(value)}</td>
                            <td>{hint}</td>
                          </tr>
                        ))}
                        {[
                          [
                            "ROE (приближённо)",
                            m.roe,
                            "Прибыль / капитал на конец периода",
                          ],
                          ["Чистая маржа", m.margin, "Прибыль / выручка"],
                          [
                            "Доля прибыли на дивиденды",
                            m.payout,
                            "Дивиденд / положительная EPS",
                          ],
                          [
                            "Прибыль / цена",
                            m.earningsYield,
                            "Не доходность инвестиции",
                          ],
                          [
                            "Поток после CAPEX / капитализация",
                            m.fcfYield,
                            "Не доходность инвестиции и не FCFE",
                          ],
                        ].map(([label, value, hint]) => (
                          <tr key={String(label)}>
                            <td>{label}</td>
                            <td>{pct(value as number | null)}</td>
                            <td>{hint}</td>
                          </tr>
                        ))}
                        <tr>
                          <td>Капитализация (приближённо)</td>
                          <td>{money(m.cap, i.currency)}</td>
                          <td>Цена × акции на отчётную дату, один класс</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="footnote">
                    {report
                      ? `Отчётный период: 12 месяцев по ${dateLabel(report.date)}. Источник: ${report.source}.`
                      : "Нет подходящей отчётности в валюте акции."}{" "}
                    Прочерк — данные отсутствуют или знаменатель
                    неположительный. Сравнивайте компании одной отрасли, валюты
                    и периода.
                  </p>
                </section>
              </>
            )}
          </div>
        )}
        {tab === "valuation" && (
          <StockValuation
            key={JSON.stringify(profile.valuation)}
            instrument={i}
            price={price}
            save={save}
          />
        )}
        {tab === "reports" && (
          <div className="page-stack">
            <StockWebResearch
              instrument={i}
              openSource={openSource}
              readDocument={readDocument}
            />
            <div className="section-heading">
              <h3>Проверенные показатели для расчётов</h3>
              <button
                className="button secondary"
                onClick={() => setEditReport("new")}
              >
                Добавить отчёт
              </button>
            </div>
            <p className="footnote">
              Для расчётов используется самый свежий отчёт в {i.currency}.
              Отчёты в других валютах сохраняются, но не смешиваются с ценой без
              пересчёта. Поля из старого редактора актива не считаются
              подтверждённым 12-месячным отчётом.
            </p>
            {!profile.reports.length ? (
              <p className="notice">
                Добавьте проверенные показатели за полные 12 месяцев из
                найденного отчёта. Укажите валюту и единицы измерения. Второй
                сопоставимый год позволит оценить рост бизнеса.
              </p>
            ) : (
              profile.reports
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <details key={r.date} open={r.date === report?.date}>
                    <summary>
                      {dateLabel(r.date)} · {r.currency} · 12 месяцев
                    </summary>
                    <p className="stock-prose">{r.source}</p>
                    <div className="detail-grid compact">
                      {reportFields.map(([key, label]) => (
                        <div key={key}>
                          <span>{label}</span>
                          <b>{num(r[key])}</b>
                        </div>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setEditReport(r)}
                    >
                      Изменить отчёт
                    </button>
                  </details>
                ))
            )}
          </div>
        )}
        {tab === "history" && (
          <div className="page-stack">
            <div className="analysis-metrics">
              <Metric
                label="Покупатель / продавец"
                value={`${num(market?.bid ?? null)} / ${num(market?.ask ?? null)}`}
                hint={`В ${i.currency}, по снимку терминала`}
              />
              <Metric
                label="Спред к средней цене"
                value={pct(spread)}
                hint="Издержка входа и выхода до комиссий"
              />
              <Metric
                label="Минимальный лот"
                value={num(market?.lot ?? null, 0)}
                hint="Количество акций, если передано источником"
              />
            </div>
            {(!market?.bid || !market.ask) && (
              <p className="notice warning">
                Нет двухсторонних котировок. Нельзя подтвердить возможность
                быстро продать акцию по цене анализа.
              </p>
            )}
            <div className="section-heading">
              <h3>Динамика цены</h3>
              <button
                className="button secondary"
                onClick={() => setHistoryEditor(true)}
              >
                Загрузить историю цен
              </button>
            </div>
            {priceHistory.length ? (
              <>
                {!profile.history.length && (
                  <p className="footnote">
                    Aigenis: средневзвешенная цена за торговый день, не цена
                    закрытия. {profile.terminal?.trades.length} записей →{" "}
                    {priceHistory.length} торговых дней.{" "}
                    {profile.terminal?.historyComplete
                      ? "Загружены все записи переданного ответа."
                      : "История может быть неполной."}{" "}
                    При нескольких режимах цена взвешивается по объёму. Дни без
                    сделок не заполняются.
                  </p>
                )}
                <Suspense fallback={<p>Открываем график…</p>}>
                  <StockChart history={priceHistory} currency={i.currency} />
                </Suspense>
                <TechnicalSummary profile={historyProfile} />
              </>
            ) : (
              <Empty
                title="История ещё не загружена"
                description="Вставьте ответ trade_stat из Aigenis или добавьте CSV с ценами закрытия. Для RSI нужно 15 наблюдений, для SMA — 50 и 200."
              />
            )}
          </div>
        )}
        {tab === "data" && (
          <div className="page-stack">
            <h3>Что известно об акции</h3>
            <div className="detail-grid compact">
              {[
                ["Тикер / идентификатор", i.ticker],
                ["Площадка", market?.exchange],
                ["Режим торгов", market?.session],
                ["ID в Aigenis", market?.definitionId],
                ["Рейтинг из Aigenis", market?.rating],
                ["Отрасль", profile.sector],
                ["Источник", i.sourceUrl],
                ...(market?.details ?? []).map((d) => [d.label, d.value]),
                ...(profile.terminal?.details ?? []).map((d) => [
                  `${d.block}: ${d.label}`,
                  d.value,
                ]),
                [
                  "Отчётность",
                  report
                    ? `${dateLabel(report.date)} · ${report.currency}`
                    : "Нет подходящего отчёта",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b className="stock-prose">{value || "Нет данных"}</b>
                </div>
              ))}
            </div>
            <p className="notice">
              Рейтинг из терминала показан как передан источником: без агентства
              и методологии он не является подтверждённым кредитным рейтингом
              или оценкой привлекательности акции. Импорт не содержит финансовую
              отчётность, новости и полный стакан, если их нет в переданном
              ответе.
            </p>
            <h3>Как читать анализ</h3>
            <ul className="stock-methods">
              <li>
                Сначала проверьте давность цены, возможность продажи и
                предупреждения эмитента.
              </li>
              <li>
                Оцените прибыль, долг и денежный поток; низкий P/E сам по себе
                не является сигналом покупки.
              </li>
              <li>
                Задайте устойчивый поток и ставки в DCF/DDM. Сопоставьте
                стоимость в трёх сценариях с ценой.
              </li>
              <li>
                Обратный DCF показывает ожидания, которые объясняют цену при
                выбранных ставках. Проверьте, реалистичны ли они для бизнеса.
              </li>
              <li>
                Технические индикаторы описывают историю. Они не предсказывают
                цену и не заменяют оценку бизнеса.
              </li>
            </ul>
            <div className="button-row">
              <button
                className="text-button"
                onClick={() =>
                  openSource(
                    "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/val.html",
                  )
                }
              >
                DCF и DDM: методика Дамодарана
              </button>
              <button
                className="text-button"
                onClick={() =>
                  openSource(
                    "https://www.msci.com/indexes/group/quality-indexes",
                  )
                }
              >
                Факторы качества: MSCI
              </button>
              {i.sourceUrl && (
                <button
                  className="text-button"
                  onClick={() => openSource(i.sourceUrl)}
                >
                  Источник акции
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      {editReport && (
        <StockReportEditor
          instrument={i}
          report={editReport === "new" ? undefined : editReport}
          save={save}
          close={() => setEditReport(null)}
        />
      )}
      {historyEditor && (
        <StockHistoryEditor
          instrument={i}
          save={save}
          close={() => setHistoryEditor(false)}
        />
      )}
    </>
  );
}
function TechnicalSummary({
  profile,
}: {
  profile: ReturnType<typeof emptyStockAnalysis>;
}) {
  const t = useMemo(() => stockTechnicals(profile.history), [profile.history]);
  return (
    <>
      <div className="analysis-metrics">
        <Metric
          label="Изменение за период"
          value={pct(t.change)}
          hint={`${dateLabel(t.first)} — ${dateLabel(t.last)}`}
        />
        <Metric
          label="Максимальная просадка"
          value={pct(t.drawdown)}
          hint="От локального пика, только внутри загруженного периода"
        />
        <Metric
          label="RSI Wilder (14)"
          value={num(t.rsi)}
          hint="14 интервалов; не сигнал покупки"
        />
      </div>
      <div className="detail-grid">
        <div>
          <span>SMA 50 наблюдений</span>
          <b>{num(t.sma50)}</b>
        </div>
        <div>
          <span>SMA 200 наблюдений</span>
          <b>{num(t.sma200)}</b>
        </div>
      </div>
      <p className="notice">
        {profile.adjusted
          ? "Пользователь отметил ряд как скорректированный на дробления и дивиденды."
          : "Цены не помечены как скорректированные: дивиденды и дробления могут искажать изменение цены и индикаторы."}{" "}
        Годовая волатильность и Sharpe не вычисляются из нерегулярных сделок.
        Источник: {profile.historySource}.
      </p>
    </>
  );
}
