import { PAGE_SIZE, Pagination } from "./Pagination";
import { useState } from "react";
import { Search, LoaderCircle, FileText } from "lucide-react";
import type { CatalogItem, Instrument } from "../domain/types";
import { today } from "../domain/types";
import { assessDebt } from "../domain/research";
import { daysBetween } from "../domain/finance";
import { dateLabel, num } from "./ui";

export function ResearchImport({
  catalog,
  open,
  manual,
}: {
  catalog: CatalogItem[];
  open: (item: CatalogItem) => Promise<void>;
  manual: () => void;
}) {
  const [resultPage, setResultPage] = useState(0);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const candidates = (items ?? catalog).filter((i) =>
    `${i.name} ${i.research?.issueId ?? ""} ${i.provider} ${i.currency}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const choose = async (item: CatalogItem) => {
    setBusy(true);
    setError("");
    try {
      await open(item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel quick-import" aria-label="Быстрый анализ выпуска">
      <div className="section-title">
        <div>
          <h2>Быстрый анализ выпуска</h2>
          <p>
            Вставьте ссылку Finstore / Aigenis или выберите инструмент из
            каталога
          </p>
        </div>
        <Search size={22} />
      </div>
      <form
        className="research-link"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await window.invest.inspectSource(url.trim());
            setItems(result.length === 1 ? null : result);
            setQuery("");
            setResultPage(0);
            if (result.length === 1) await open(result[0]);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Ссылка на выпуск"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://finstore.by/kupit-tokeny/… или https://aigenis.by/bonds/"
        />
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Search size={16} />
          )}
          Разобрать ссылку
        </button>
        <button type="button" className="button secondary" onClick={manual}>
          Ввести вручную
        </button>
      </form>
      <details className="research-picker" open={items !== null || undefined}>
        <summary>
          Выбрать из каталога · {(items ?? catalog).length} выпусков
        </summary>
        <input
          aria-label="Поиск выпуска"
          placeholder="Компания, номер выпуска или валюта"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResultPage(0);
          }}
        />
        <div className="research-results">
          {candidates
            .slice(resultPage * PAGE_SIZE, (resultPage + 1) * PAGE_SIZE)
            .map((i) => (
              <button
                className="research-result"
                disabled={busy}
                key={i.id}
                onClick={() => choose(i)}
              >
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.provider} · {i.research?.issueId} · {i.currency}
                  </small>
                </span>
                <span>
                  {i.rate === null
                    ? "Ставка не указана"
                    : `${num(i.rate)}% годовых`}
                  {i.research?.rateModel === "indexed" && (
                    <small>С индексацией</small>
                  )}
                </span>
              </button>
            ))}
          {!candidates.length && (
            <p className="muted">
              Нет подходящих выпусков. Обновите источники или вставьте ссылку на
              открытую страницу.
            </p>
          )}
        </div>
        <Pagination
          count={candidates.length}
          page={resultPage}
          change={setResultPage}
        />
        {items && (
          <button className="text-button" onClick={() => setItems(null)}>
            Вернуться к сохранённому каталогу
          </button>
        )}
      </details>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="muted">
        Анализ сохраняется в вашем списке. Покупка и движение денег появятся
        только после записи операции.
      </p>
    </section>
  );
}

export function ResearchSummary({
  instrument: i,
  openSource,
  edit,
}: {
  instrument: Instrument;
  openSource: (url: string) => void;
  edit: (i: Instrument) => void;
}) {
  const r = i.research;
  const assessment = assessDebt(i);
  const stale = r && daysBetween(r.fetchedAt.slice(0, 10), today()) > 7;
  return (
    <section className="panel research-summary" aria-label="Оценка выпуска">
      <div className="research-overview">
        <div>
          <small>Купонная ставка</small>
          <strong>
            {r?.rateKnown === false ? "Не указана" : num(i.annualRate) + "%"}
          </strong>
          <p>
            {i.currency}
            {r?.rateModel === "indexed"
              ? " · с индексацией"
              : " · по условиям выпуска"}
          </p>
        </div>
        <div className={"assessment " + assessment.tone}>
          <small>Проверка данных</small>
          <h2>{assessment.label}</h2>
          <p>Оценка приложения, не кредитный рейтинг</p>
        </div>
        <div>
          <small>
            {r?.rating?.kind === "reputation"
              ? "Рейтинг деловой репутации"
              : "Кредитный рейтинг"}
          </small>
          <strong>{r?.rating?.value ?? "Не найден"}</strong>
          <p>
            {r?.rating
              ? r.rating.agency || "Опубликован на " + i.provider
              : "Нет опубликованных данных"}
          </p>
        </div>
      </div>
      {assessment.problems.length > 0 && (
        <p className="notice warning">{assessment.problems.join(" · ")}</p>
      )}
      {r?.rating?.kind === "reputation" && (
        <p className="footnote">
          Рейтинг деловой репутации не оценивает вероятность исполнения долга.
        </p>
      )}
      <details className="compact-details">
        <summary>Риски, документы и источники</summary>
        {assessment.missing.length > 0 && (
          <p>Не хватает: {assessment.missing.join("; ")}.</p>
        )}
        <p>
          Эмитент: {r?.issuer || i.name}. Погашение:{" "}
          {i.maturity ? dateLabel(i.maturity) : r?.maturityText || "не указано"}
          . Обеспечение: {r?.security || "не установлено"}.
        </p>
        <p>
          Выплаты:{" "}
          {r?.paymentStatus === "late"
            ? "отмечена просрочка"
            : r?.paymentStatus === "current"
              ? "проверены пользователем"
              : "история не проверена"}
          {r?.statusDate ? " · " + dateLabel(r.statusDate) : ""}.
        </p>
        {r?.statusSource && (
          <button
            className="text-button"
            onClick={() => openSource(r.statusSource)}
          >
            Источник проверки выплат ↗
          </button>
        )}
        {r?.rating && (
          <p>
            Дата рейтинга:{" "}
            {r.rating.date ? dateLabel(r.rating.date) : "не указана"}.{" "}
            <button
              className="text-button"
              onClick={() => openSource(r.rating!.sourceUrl)}
            >
              Источник рейтинга ↗
            </button>
          </p>
        )}
        <p className={stale ? "amber" : "muted"}>
          {r
            ? "Загружено " +
              dateLabel(r.fetchedAt.slice(0, 10)) +
              (stale ? " · данные старше недели" : "")
            : "Условия введены вручную"}
          . Дата загрузки не подтверждает актуальность рейтинга или цены.
        </p>
        {r?.documents.map((d) => (
          <button
            className="document-link"
            key={d.url}
            onClick={() => openSource(d.url)}
          >
            <FileText size={16} />
            {d.title} ↗
          </button>
        ))}
        {!!r?.paymentDates.length && (
          <p>
            Следующие даты выплат:{" "}
            {r.paymentDates
              .filter((d) => d > today())
              .slice(0, 12)
              .map(dateLabel)
              .join(" · ") || "нет данных"}
            .
          </p>
        )}
        <details className="compact-details">
          <summary>Как получена оценка</summary>
          <p>
            Просрочка или неположительный капитал — высокий риск. Убыток либо
            долг / капитал выше 3 — факторы риска. Базовая проверка требует
            отчётности до 550 дней, долга, капитала, прибыли, проверки выплат до
            90 дней с источником, обеспечения и срока погашения. Пороги не
            учитывают отраслевую специфику.
          </p>
          <p>
            Высокая ставка и рейтинг не повышают оценку автоматически.
            Отсутствие сведений о просрочках не подтверждает своевременность
            выплат.
          </p>
          {r?.caveats.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </details>
      </details>
      <button className="text-button" onClick={() => edit(i)}>
        Дополнить данные для оценки
      </button>
    </section>
  );
}
