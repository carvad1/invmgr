import { useMemo, useState } from "react";
import type { Instrument } from "../domain/types";
import { emptyStockAnalysis } from "../domain/stock-schema";
import {
  latestWebDividend,
  stockIssuerUnp,
  webDividendYield,
} from "../domain/stock-web";
import { dateLabel, Field, Metric, money, num } from "./ui";

export function StockWebStatus({
  instrument: i,
  busy,
  refresh,
  save,
}: {
  instrument: Instrument;
  busy: boolean;
  refresh: () => void;
  save: (i: Instrument) => Promise<void>;
}) {
  const w = i.stockAnalysis?.web;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="stock-web-status">
      <div className="section-heading">
        <p role="status">
          {busy
            ? "Собираем данные из интернета… Можно продолжать работу."
            : w
              ? `${w.status === "error" ? "Источники недоступны · сохранённые данные" : w.status === "partial" ? "Получена часть данных" : w.status === "unresolved" ? "Нужно уточнить эмитента" : "Данные из интернета"} · проверка ${dateLabel(w.checkedAt)}`
              : "Отчётность и выплаты загружаются автоматически"}
        </p>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={refresh}
        >
          Обновить из интернета
        </button>
      </div>
      {(w?.status === "error" || w?.status === "partial") && (
        <p className="footnote">
          Неудачные запросы не удаляют ранее полученные документы и выплаты.
          Подробности — в отчётности.
        </p>
      )}
      <details className="stock-source-settings">
        <summary>
          Эмитент:{" "}
          {w?.identity
            ? `УНП ${w.identity.unp}`
            : stockIssuerUnp(i) || "не определён"}{" "}
          · настроить поиск
        </summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const unp = String(
              new FormData(e.currentTarget).get("unp") ?? "",
            ).trim();
            setError("");
            if (unp && !/^\d{9}$/.test(unp)) {
              setError("УНП должен содержать 9 цифр");
              return;
            }
            setSaving(true);
            try {
              await save({
                ...i,
                stockAnalysis: {
                  ...(i.stockAnalysis ?? emptyStockAnalysis()),
                  issuerUnp: unp,
                },
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          }}
          className="toolbar"
        >
          <Field label="УНП для поиска отчётности">
            <input
              name="unp"
              inputMode="numeric"
              maxLength={9}
              defaultValue={i.stockAnalysis?.issuerUnp ?? stockIssuerUnp(i)}
            />
          </Field>
          <button className="button secondary small" disabled={saving}>
            Сохранить УНП
          </button>
        </form>
        <p className="footnote">
          Автоматически берётся из Aigenis. Используется точное совпадение УНП
          на ЕПФР.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </details>
    </div>
  );
}

export function StockWebSummary({
  instrument: i,
  price,
  showReports,
}: {
  instrument: Instrument;
  price: number | null;
  showReports: () => void;
}) {
  const d = latestWebDividend(i),
    w = i.stockAnalysis?.web,
    y = webDividendYield(i, price);
  const announced = w?.announcements?.find((a) => a.currency === i.currency);
  if (!w) return null;
  return (
    <section className="page-stack stock-web-summary">
      {d && (
        <div className="analysis-metrics">
          <Metric
            label={`Дивиденд за ${d.earningsYear} год`}
            value={`${num(d.amount, 8)} ${d.currency}`}
            hint={`На акцию · год выплаты ${d.paymentYear}`}
          />
          <Metric
            label="Доходность по этой выплате"
            value={y === null ? "—" : `${num(y * 100)}%`}
            hint="Годовой дивиденд / цена анализа, до налогов и комиссий"
          />
          <Metric
            label="История дивидендов"
            value={`${w.dividends.length} лет`}
            hint={d.shareClass}
          />
        </div>
      )}
      {!d && announced && (
        <div className="analysis-metrics">
          <Metric
            label="Объявлено на акцию"
            value={`${num(announced.amount, 8)} ${announced.currency}`}
            hint={
              announced.earningsYear
                ? `За ${announced.earningsYear} год · решение эмитента`
                : "Период в решении не указан"
            }
          />
          <Metric
            label="Начисление / цена"
            value={
              price && price > 0
                ? `${num((announced.amount / price) * 100)}%`
                : "—"
            }
            hint="Одна объявленная выплата, не годовая доходность"
          />
          <Metric
            label="Опубликовано"
            value={dateLabel(announced.publishedAt)}
            hint={announced.shareClass}
          />
        </div>
      )}
      <div className="section-heading">
        <p className="footnote">
          {d
            ? "Прошлая годовая выплата, не прогноз и не выплата за последние 12 месяцев."
            : announced
              ? "Показано последнее найденное решение. Поступление денег и будущие выплаты не подтверждены."
              : w.issues[0] ||
                "Документы собраны; показатели ещё не подтверждены."}
        </p>
        <button className="text-button" onClick={showReports}>
          Источники и документы ({w.documents.length})
        </button>
      </div>
    </section>
  );
}

const kindLabels = {
  report: "Отчётность",
  dividend: "Дивиденды",
  event: "События",
  other: "Прочее",
};
const stateLabels = {
  unread: "По ссылке",
  text: "Текст доступен",
  scan: "Скан без текста",
  unsupported: "Просмотр в источнике",
  error: "Загрузка не удалась",
};
export default function StockWebResearch({
  instrument: i,
  openSource,
  readDocument,
}: {
  instrument: Instrument;
  openSource: (url: string) => void;
  readDocument: (id: string, docId: string) => Promise<void>;
}) {
  const w = i.stockAnalysis?.web;
  const [kind, setKind] = useState("report"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(10);
  const [reading, setReading] = useState(""),
    [error, setError] = useState("");
  const documents = useMemo(
    () =>
      (w?.documents ?? []).filter(
        (d) =>
          (kind === "all" || d.kind === kind) &&
          `${d.title} ${d.pages.map((p) => p.text).join(" ")}`
            .toLocaleLowerCase("ru")
            .includes(query.toLocaleLowerCase("ru")),
      ),
    [w, kind, query],
  );
  if (!w)
    return (
      <p className="notice">
        Автосбор ещё не выполнен. Нажмите «Обновить из интернета».
      </p>
    );
  return (
    <section className="page-stack stock-web-research">
      <div>
        <h3>Официальные источники</h3>
        <p className="footnote">
          {w.identity?.name || "Эмитент пока не сопоставлен"}. Сохраняются
          публичные раскрытия, документы и выплаты. Автообновление — раз в сутки
          при открытом приложении.
        </p>
      </div>
      {w.dividends.length > 0 && (
        <details>
          <summary>Выплаты по вашему выпуску</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>За год</th>
                  <th>Год выплаты</th>
                  <th>На акцию</th>
                  <th>Выпуск</th>
                </tr>
              </thead>
              <tbody>
                {w.dividends.map((d) => (
                  <tr key={`${d.earningsYear}:${d.shareClass}`}>
                    <td>{d.earningsYear}</td>
                    <td>{d.paymentYear}</td>
                    <td>
                      {num(d.amount, 8)} {d.currency}
                    </td>
                    <td>{d.shareClass}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="text-button"
            onClick={() => openSource(w.dividends[0].source)}
          >
            Таблица выплат на сайте банка
          </button>
          {w.shareInfo && (
            <p className="footnote">
              Акций этого выпуска: {num(w.shareInfo.shares, 0)} на{" "}
              {dateLabel(w.shareInfo.asOf)}. Это количество отдельного класса на
              указанную дату; оно не используется для расчёта EPS и
              капитализации всего банка.
            </p>
          )}
        </details>
      )}
      {!!w.announcements?.length && (
        <details open>
          <summary>Решения о дивидендах</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Опубликовано</th>
                  <th>На акцию</th>
                  <th>Период</th>
                  <th>Основание</th>
                </tr>
              </thead>
              <tbody>
                {w.announcements.map((a) => (
                  <tr key={a.source}>
                    <td>{dateLabel(a.publishedAt)}</td>
                    <td>
                      {num(a.amount, 8)} {a.currency}
                    </td>
                    <td>{a.earningsYear ?? "Не указан"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openSource(a.source)}
                      >
                        Решение · {a.shareClass}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote">
            Объявленные начисления. Получение денег и полный годовой итог не
            подтверждены; суммы не складываются с годовой дивидендной
            доходностью.
          </p>
        </details>
      )}
      <div className="toolbar">
        <input
          aria-label="Поиск в документах"
          placeholder="Поиск по названиям и прочитанному тексту"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(10);
          }}
        />
        <select
          aria-label="Тип документа"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setLimit(10);
          }}
        >
          <option value="all">Все документы</option>
          {Object.entries(kindLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="footnote">
        Найдено: {documents.length}. В PDF читаются первые 12 страниц; до 3
        страниц сканов распознаются локально. Текст помогает найти сведения; он
        не считается проверенной финансовой моделью.
      </p>
      {!documents.length && (
        <p className="notice">Документы по этому фильтру не найдены.</p>
      )}
      {documents.slice(0, limit).map((d) => (
        <details key={d.id} className="stock-document">
          <summary>
            {d.title}
            <small className="stock-sub">
              {kindLabels[d.kind]} ·{" "}
              {d.ocr ? "Распознано из скана" : stateLabels[d.state]}
            </small>
          </summary>
          <p className="footnote">
            {d.uploadedAt && `Добавлено на ЕПФР: ${d.uploadedAt}. `}
            {d.reportingDate &&
              `Дата, указанная в раскрытии: ${d.reportingDate}. `}
            Отчётный период уточняется по самому документу.
          </p>
          <div className="button-row">
            <button className="text-button" onClick={() => openSource(d.url)}>
              Открыть оригинал
            </button>
            {["unread", "error"].includes(d.state) && (
              <button
                className="text-button"
                disabled={!!reading}
                onClick={async () => {
                  setReading(d.id);
                  setError("");
                  try {
                    await readDocument(i.id, d.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setReading("");
                  }
                }}
              >
                {reading === d.id ? "Читаем…" : "Прочитать документ"}
              </button>
            )}
          </div>
          {d.state === "scan" && (
            <p className="notice">
              В PDF нет доступного текстового слоя. Откройте оригинал для
              просмотра. Числа из скана не участвуют в расчётах.
            </p>
          )}
          {d.state === "unsupported" && (
            <p className="notice">
              Для этого формата или внешнего адреса доступен оригинал.
              Автоматическое извлечение не выполнено.
            </p>
          )}
          {d.state === "error" && (
            <p className="notice">
              Не удалось загрузить или прочитать PDF. Проверьте оригинал или
              повторите попытку.
            </p>
          )}
          {d.truncated && (
            <p className="notice">
              Показан фрагмент документа. Полный текст — в оригинале (
              {d.pageCount} стр.).
            </p>
          )}
          {d.ocr && (
            <p className="notice warning">
              Текст распознан автоматически. В таблицах возможны ошибки цифр и
              колонок: перед использованием показателей проверьте оригинал.
            </p>
          )}
          {d.pages
            .filter((p) => p.text)
            .map((p) => (
              <div key={p.page}>
                <h4>
                  {d.pageCount ? "Страница" : "Текст · фрагмент"} {p.page}
                  {p.ocrConfidence === undefined
                    ? ""
                    : ` · OCR ${num(p.ocrConfidence, 0)}%`}
                </h4>
                <pre className="stock-document-text">{p.text}</pre>
              </div>
            ))}
        </details>
      ))}
      {documents.length > limit && (
        <button
          className="button secondary small"
          onClick={() => setLimit((v) => v + 10)}
        >
          Ещё документы
        </button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <details>
        <summary>Проверка источников и ограничения</summary>
        {w.sources.map((s, n) => (
          <div className="stock-source-log" key={`${s.name}:${n}`}>
            <button className="text-button" onClick={() => openSource(s.url)}>
              {s.name}
            </button>
            <span>
              {s.ok ? "Получено" : s.message} · {dateLabel(s.checkedAt)}
            </span>
          </div>
        ))}
        {w.issues.map((issue) => (
          <p className="footnote" key={issue}>
            {issue}
          </p>
        ))}
        <p className="footnote">
          Автосбор не получает закрытые данные Aigenis, не меняет котировки и не
          создаёт операций. Отчёты из интернета не заменяют введённые вами
          проверенные показатели. Документы отражают публикации источника;
          отсутствие раскрытий не считается положительным рейтингом.
        </p>
      </details>
    </section>
  );
}
