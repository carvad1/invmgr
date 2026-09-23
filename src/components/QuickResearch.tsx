import { useState } from "react";
import {
  ExternalLink,
  Search,
  LoaderCircle,
  FileText,
  ShieldCheck,
} from "lucide-react";
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
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const candidates = (items ?? catalog).filter(
    (i) =>
      ["token", "bond"].includes(i.kind) &&
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
          Выбрать из каталога ·{" "}
          {
            (items ?? catalog).filter((i) => ["token", "bond"].includes(i.kind))
              .length
          }{" "}
          выпусков
        </summary>
        <input
          aria-label="Поиск выпуска"
          placeholder="Компания, номер выпуска или валюта"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="research-results">
          {candidates.map((i) => (
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
        <div className="published-rating coupon-headline">
          <small>СТАВКА В УСЛОВИЯХ</small>
          <strong>
            {r?.rateKnown === false ? "Не указана" : `${num(i.annualRate)}%`}
          </strong>
          <p>Годовых · {i.currency}</p>
          <p>
            {r?.rateModel === "indexed"
              ? "С индексацией / переменная. Нужна формула выплат."
              : "Купонная ставка. Итог по покупке зависит от цены, срока и комиссии."}
          </p>
        </div>
        <div className={`assessment ${assessment.tone}`}>
          <small>ОБЩАЯ ОЦЕНКА ПРИЛОЖЕНИЯ</small>
          <h2>{assessment.label}</h2>
          <p>
            Проверка условий и финансовых показателей. Не кредитный рейтинг и не
            вероятность возврата денег.
          </p>
        </div>
        <div className="published-rating">
          <small>
            {r?.rating?.kind === "reputation"
              ? "РЕЙТИНГ ДЕЛОВОЙ РЕПУТАЦИИ"
              : "КРЕДИТНЫЙ РЕЙТИНГ"}
          </small>
          <strong>{r?.rating?.value ?? "Не найден"}</strong>
          <p>
            {r?.rating
              ? `${r.rating.agency || `Опубликован на ${i.provider}`}. ${r.rating.date ? `Дата рейтинга: ${dateLabel(r.rating.date)}` : "Дата присвоения не указана"}.`
              : "На проверенной странице рейтинг не указан. Это не означает низкий рейтинг."}
          </p>
          {r?.rating?.kind === "reputation" && (
            <p className="amber">
              Деловая репутация не оценивает вероятность исполнения долга.
            </p>
          )}
          {r?.rating && (
            <button
              className="text-button"
              onClick={() => openSource(r.rating!.sourceUrl)}
            >
              Источник рейтинга <ExternalLink size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="research-findings">
        <div>
          <h3>Что влияет на оценку</h3>
          {assessment.problems.map((p) => (
            <p className="risk-finding" key={p}>
              {p}
            </p>
          ))}
          {!!assessment.missing.length && (
            <p>Для вывода не хватает: {assessment.missing.join("; ")}.</p>
          )}
          {!assessment.problems.length && !assessment.missing.length && (
            <p>
              Введённые данные прошли базовые проверки. Отрасль, денежные
              потоки, условия обеспечения и связанные лица требуют отдельного
              анализа.
            </p>
          )}
          <p>
            Обеспечение: {r?.security || "не установлено по доступной карточке"}
            .
          </p>
          <p>
            Выплаты:{" "}
            {r?.paymentStatus === "late"
              ? "отмечена просрочка"
              : r?.paymentStatus === "current"
                ? "проверены пользователем"
                : "история исполнения не проверена"}
            {r?.statusDate ? ` · ${dateLabel(r.statusDate)}` : ""}.
          </p>
          {r?.statusSource && (
            <button
              className="text-button"
              onClick={() => openSource(r.statusSource)}
            >
              Источник проверки выплат <ExternalLink size={13} />
            </button>
          )}
          <button className="button secondary small" onClick={() => edit(i)}>
            <ShieldCheck size={15} />
            Дополнить данные для оценки
          </button>
        </div>
        <div>
          <h3>Условия и документы</h3>
          <p>
            Эмитент: {r?.issuer || i.name}. Выпуск:{" "}
            {r?.issueId || i.ticker || "не указан"}.
          </p>
          <p>
            Погашение:{" "}
            {i.maturity
              ? dateLabel(i.maturity)
              : r?.maturityText || "нет данных"}
            .
          </p>
          <p className={stale ? "amber" : "muted"}>
            {r
              ? `Загружено ${dateLabel(r.fetchedAt.slice(0, 10))}${stale ? " · данные старше недели" : ""}. Дата загрузки не подтверждает актуальность рейтинга или цены.`
              : "Условия введены вручную."}
          </p>
          {r?.documents.map((d) => (
            <button
              className="document-link"
              key={d.url}
              onClick={() => openSource(d.url)}
            >
              <FileText size={16} />
              {d.title}
              <ExternalLink size={13} />
            </button>
          ))}
          {!!r?.paymentDates.length && (
            <details>
              <summary>Даты выплат с сайта · {r.paymentDates.length}</summary>
              <p>
                {r.paymentDates
                  .filter((d) => d > today())
                  .slice(0, 12)
                  .map(dateLabel)
                  .join(" · ") || "Будущих дат нет"}
              </p>
            </details>
          )}
        </div>
      </div>
      <details className="research-method">
        <summary>Как получена оценка и что предполагает расчёт</summary>
        <p>
          Просрочка или неположительный капитал → высокий риск по данным. Убыток
          либо долг / капитал выше 3 → есть факторы риска. При отсутствии этих
          признаков и нехватке данных вывод откладывается. Базовая проверка
          требует отчётности до 550 дней, данных о долге, капитале и прибыли,
          проверки выплат до 90 дней с источником, обеспечения и срока
          погашения. Пороги служат фильтром внимания и не учитывают отраслевую
          специфику.
        </p>
        <p>
          Высокая ставка и опубликованный рейтинг не повышают оценку
          автоматически. Отсутствие сведений о просрочках не считается
          подтверждением своевременных выплат.
        </p>
        {r?.caveats.map((c) => (
          <p key={c}>{c}</p>
        ))}
      </details>
    </section>
  );
}
