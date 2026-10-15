import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, RefreshCw } from "lucide-react";
import type { CatalogItem } from "../domain/types";
import {
  catalogBondRows,
  bondAnalysis,
  parseTerminalBonds,
  type BondRow,
} from "../domain/bond-screener";
import { dateLabel, Empty, Modal, num } from "./ui";
import { PAGE_SIZE, Pagination } from "./Pagination";
export type BondImport = { rows: BondRow[]; raw: string };
export function BondScreener({
  catalog,
  refresh,
  open,
  imported,
  setImported,
}: {
  catalog: CatalogItem[];
  refresh: () => Promise<void>;
  open: (item: CatalogItem) => Promise<void>;
  imported: BondImport;
  setImported: (value: BondImport) => void;
}) {
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("all");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState<BondRow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const map = new Map<string, BondRow>();
    for (const row of catalogBondRows(catalog)) map.set(row.id, row);
    for (const row of imported.rows) map.set(row.id, row);
    return [...map.values()]
      .filter(
        (r) =>
          (currency === "all" || r.currency === currency) &&
          `${r.name} ${r.issuer} ${r.id}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "yield"
          ? (bondAnalysis(b).yield ?? -Infinity) -
              (bondAnalysis(a).yield ?? -Infinity) ||
            a.name.localeCompare(b.name, "ru")
          : sort === "coupon"
            ? (b.coupon ?? -Infinity) - (a.coupon ?? -Infinity) ||
              a.name.localeCompare(b.name, "ru")
            : a.name.localeCompare(b.name, "ru"),
      );
  }, [catalog, imported.rows, query, currency, sort]);
  useEffect(() => {
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)),
    );
  }, [rows.length]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectedAnalysis = selected ? bondAnalysis(selected) : null;
  return (
    <section className="panel" aria-label="Быстрый просмотр облигаций">
      <div className="section-title">
        <div>
          <h2>Облигации</h2>
          <p>
            {imported.rows.length
              ? `Из Aigenis: ${imported.rows.length} · доступны до закрытия приложения`
              : "Сравните купон, доходность покупки и опубликованный рейтинг"}
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void run(refresh)}
            aria-label="Обновить каталог"
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            <span>Обновить</span>
          </button>
          <button
            className="button primary"
            onClick={() => {
              setError("");
              setImporting(true);
            }}
          >
            <ClipboardPaste size={16} />
            Вставить из Aigenis
          </button>
        </div>
      </div>
      <div className="toolbar">
        <input
          aria-label="Поиск облигации"
          placeholder="Эмитент или выпуск"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Валюта облигации"
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Все валюты</option>
          {["BYN", "USD", "EUR", "RUB"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Сортировка облигаций"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          <option value="name">По названию</option>
          <option value="yield">По доходности</option>
          <option value="coupon">По купону</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Выпуск</th>
                  <th>Купон</th>
                  <th>Доходность</th>
                  <th>Кредитный рейтинг</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((r) => {
                    const analysis = bondAnalysis(r);
                    return (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => setSelected(r)}
                          >
                            {r.name}
                          </button>
                          <small>
                            {r.currency}
                            {r.indexed ? " · индексация" : ""}
                            {r.warning ? " · есть предупреждение" : ""}
                          </small>
                        </td>
                        <td>{r.coupon === null ? "—" : `${num(r.coupon)}%`}</td>
                        <td>
                          {analysis.yield === null
                            ? "Нет данных"
                            : `${num(analysis.yield)}%`}
                          {analysis.source && (
                            <small>
                              {analysis.source === "last"
                                ? "По последней сделке · ориентир"
                                : "По предложению продажи"}
                            </small>
                          )}
                        </td>
                        <td>{r.rating}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <Pagination count={rows.length} page={page} change={setPage} />
        </>
      ) : (
        <Empty
          title="Загрузите облигации для сравнения"
          description="В Aigenis нажмите Copy response, затем «Вставить из Aigenis» здесь. Также можно обновить открытый каталог."
        />
      )}
      <p className="footnote">
        При вставке используем цену продажи, а если её нет — цену последней
        сделки. Доходность по последней сделке — ориентир из Aigenis; эта цена
        может быть недоступна сейчас.
      </p>
      {!importing && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <Modal
          title={selected.name}
          subtitle={`${selected.issuer} · ${selected.currency}`}
          close={() => setSelected(null)}
        >
          <div className="detail-grid">
            <div>
              <small>
                {selectedAnalysis?.source === "last"
                  ? "Ориентировочная доходность"
                  : "Доходность покупки"}
              </small>
              <b>
                {selectedAnalysis?.yield == null
                  ? "Нет данных"
                  : `${num(selectedAnalysis.yield)}%`}
              </b>
            </div>
            <div>
              <small>Кредитный рейтинг</small>
              <b>{selected.rating}</b>
            </div>
            <div>
              <small>Купон</small>
              <b>
                {selected.coupon === null
                  ? "Не указан"
                  : `${num(selected.coupon)}%`}
              </b>
            </div>
            <div>
              <small>Погашение</small>
              <b>{dateLabel(selected.maturity)}</b>
            </div>
          </div>
          <section className="notice" aria-label="Цена для анализа">
            <strong>
              Цена для анализа:{" "}
              {selectedAnalysis?.price == null
                ? "не указана"
                : `${num(selectedAnalysis.price)} ${selected.currency}`}
            </strong>
            <p>
              {selectedAnalysis?.source === "last"
                ? "Заявки на продажу нет — используем последнюю цену сделки. Доходность взята из расчёта Aigenis для этой сделки, без пересчёта на сегодня и ваших комиссий."
                : selectedAnalysis?.source === "offer"
                  ? "Используем предложение продажи из вставленных данных."
                  : "В ответе нет ни цены продажи, ни цены последней сделки."}
            </p>
            {selectedAnalysis?.price != null &&
              selectedAnalysis.yield === null && (
                <p>
                  Доходность для этой цены в ответе не указана либо выпуск
                  индексируемый. Для отдельного расчёта нужны условия и график
                  выплат.
                </p>
              )}
          </section>
          {selected.warning && (
            <p className="notice warning">{selected.warning}</p>
          )}
          {selected.indexed && (
            <p className="notice">
              Выпуск индексируемый. Для сравнения с вкладом в BYN нужен сценарий
              курса и условия выплат.
            </p>
          )}
          <p>
            Предложение продажи:{" "}
            {selected.offer
              ? `${num(selected.offer)} ${selected.currency}`
              : "отсутствует в ответе"}
            . Последняя сделка:{" "}
            {selected.lastPrice
              ? `${num(selected.lastPrice)} ${selected.currency}`
              : "нет данных"}
            .
          </p>
          {selected.historicalYield !== null &&
            selectedAnalysis?.source !== "last" && (
              <p>
                Доходность по прошлой сделке: {num(selected.historicalYield)}%.
                Это не доступная доходность покупки.
              </p>
            )}
          <p className="muted">
            {selected.priceDate
              ? `${selected.source === "terminal" ? "Обновление торговых данных" : "Дата цены"}: ${dateLabel(selected.priceDate)}`
              : "Дата цены неизвестна"}
            . У рейтинга нужно проверить агентство и дату.
          </p>
          {selected.catalog && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await open(selected.catalog!);
                  setSelected(null);
                })
              }
            >
              Открыть расчёт
            </button>
          )}
        </Modal>
      )}
      {importing && (
        <Modal
          title="Вставить из Aigenis"
          subtitle="Скопируйте ответ кнопкой Copy response в расширении"
          close={() => setImporting(false)}
        >
          <label className="paste-label" htmlFor="aigenis-response">
            Вставьте скопированные данные · Ctrl+V
          </label>
          <textarea
            autoFocus
            id="aigenis-response"
            className="paste-area"
            aria-label="JSON карточек облигаций"
            value={imported.raw}
            onChange={(e) => setImported({ ...imported, raw: e.target.value })}
            placeholder='{"results": […]}'
          />
          <p className="footnote">
            Нужен только ответ с облигациями. Заголовки Authorization и Cookie
            сюда вставлять не нужно.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="form-footer">
            <button
              className="button secondary"
              onClick={() => setImporting(false)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              disabled={!imported.raw.trim()}
              onClick={() => {
                try {
                  const parsed = parseTerminalBonds(imported.raw);
                  const merged = new Map(imported.rows.map((r) => [r.id, r]));
                  parsed.forEach((r) => merged.set(r.id, r));
                  setImported({ rows: [...merged.values()], raw: "" });
                  setPage(0);
                  setQuery("");
                  setCurrency("all");
                  setError("");
                  setImporting(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Показать облигации
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
