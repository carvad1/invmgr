import { useState } from "react";
import { currencies, today, type State } from "../domain/types";
import { fxAt } from "../domain/finance";
import { dateLabel, money, num } from "../components/ui";

export default function Settings({
  state,
  update,
  notify,
  sync,
  syncing,
  fx,
}: {
  state: State;
  update: (state: State) => void;
  notify: (text: string, error?: boolean) => void;
  sync: () => Promise<void>;
  syncing: boolean;
  fx: () => void;
}) {
  const [rate, setRate] = useState(String(state.settings.benchmarkRate));
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-layout page-stack">
      <section className="panel">
        <h2>Отображение и сравнение</h2>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              update(
                await window.invest.saveSettings({
                  ...state.settings,
                  benchmarkRate: Number(rate),
                }),
              );
              notify("Настройки сохранены");
            });
          }}
        >
          <label>
            Валюта портфеля
            <select
              aria-label="Валюта портфеля"
              value={state.settings.baseCurrency}
              onChange={(e) =>
                void run(async () =>
                  update(
                    await window.invest.saveSettings({
                      ...state.settings,
                      baseCurrency: e.target
                        .value as State["settings"]["baseCurrency"],
                    }),
                  ),
                )
              }
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Ставка вклада для сравнения, %
            <input
              type="number"
              required
              min="0"
              max="100"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Сохранить
          </button>
        </form>
        <p className="footnote">
          В анализе ориентир считается в валюте выбранного инструмента. Для
          сравнения разных валют нужен отдельный сценарий курса.
        </p>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Источники и курсы</h2>
            <p>
              Finstore, Aigenis и НБРБ · {state.catalog.length} инструментов в
              каталоге
            </p>
          </div>
          <button
            className="button secondary"
            onClick={sync}
            disabled={syncing}
          >
            {syncing ? "Обновляем…" : "Обновить данные"}
          </button>
        </div>
        <label className="stock-auto-setting">
          <input
            type="checkbox"
            checked={state.settings.stockAutoRefresh !== false}
            disabled={busy}
            onChange={(e) => {
              const enabled = e.target.checked;
              void run(async () =>
                update(
                  await window.invest.saveSettings({
                    ...state.settings,
                    stockAutoRefresh: enabled,
                  }),
                ),
              );
            }}
          />{" "}
          Автоматически собирать отчётность и выплаты по акциям
        </label>
        <p className="footnote">
          ЕПФР и поддерживаемые сайты эмитентов. Проверка раз в сутки при
          открытом приложении; полученное доступно без интернета. В карточке
          можно обновить вручную.
        </p>
        <div className="currency-rates">
          {currencies
            .filter((c) => c !== "BYN")
            .map((c) => {
              const r = fxAt(state, c, today());
              return (
                <div key={c}>
                  <strong>
                    1 {c} = {r ? money(r.rate, "BYN", 4) : "нет курса"}
                  </strong>
                  <small>
                    {r
                      ? `${dateLabel(r.date)} · ${r.source}`
                      : "Обновите данные или введите курс"}
                  </small>
                </div>
              );
            })}
        </div>
        <button className="text-button" onClick={fx}>
          Ввести курс вручную
        </button>
        <details className="compact-details">
          <summary>Состояние источников</summary>
          {state.syncRuns.length ? (
            state.syncRuns.map((s, n) => (
              <div className="list-row" key={`${s.provider}:${n}`}>
                <span>
                  <strong>{s.provider}</strong>
                  <small>{s.message}</small>
                </span>
                <span className={s.status === "error" ? "danger" : "muted"}>
                  {s.status === "error" ? "Не обновлён" : "Обновлён"}
                  <small>{dateLabel(s.date)}</small>
                </span>
              </div>
            ))
          ) : (
            <p>Источники ещё не обновлялись.</p>
          )}
        </details>
      </section>
      <section className="panel">
        <h2>Ваши данные</h2>
        <p>
          База хранится на этом компьютере. Автоматическая копия создаётся при
          запуске.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const path = await window.invest.backup();
                if (path) notify(`Копия сохранена: ${path}`);
              })
            }
          >
            Создать резервную копию
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const path = await window.invest.exportCsv();
                if (path) notify(`CSV сохранён: ${path}`);
              })
            }
          >
            Экспорт CSV
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const restored = await window.invest.restore();
                if (restored) {
                  update(restored);
                  notify("Данные восстановлены");
                }
              })
            }
          >
            Восстановить из копии
          </button>
        </div>
        <details className="compact-details">
          <summary>Расположение базы</summary>
          <p className="path-box">{state.dbPath}</p>
          <p className="muted">
            База и резервные копии без шифрования и пароля.
          </p>
        </details>
      </section>
      <details className="panel">
        <summary>Как считаются результаты</summary>
        <div className="method-copy">
          <h3>Стоимость и прибыль</h3>
          <p>
            Последняя цена × количество + деньги + расчётные проценты вкладов.
            Без котировки используется стоимость покупки с пометкой. Прибыль =
            стоимость + выводы − пополнения. Подтверждённые выплаты процентов не
            дублируются.
          </p>
          <h3>Валюта и комиссии</h3>
          <p>
            Операции переводятся в BYN по введённому историческому курсу,
            остатки — по последнему сохранённому. Комиссии покупки включены в
            стоимость. Валютный эффект входит в общий результат.
          </p>
          <h3>Годовая доходность</h3>
          <p>
            XIRR учитывает даты внешних вложений, выводов и текущую стоимость,
            включая расчётные проценты. При неоднозначных потоках или отсутствии
            периода показан прочерк. Налоги не рассчитываются.
          </p>
          <p>
            Ориентир вклада: {num(state.settings.benchmarkRate)}%. Расчёты
            будущих выплат предполагают исполнение обязательств.
          </p>
        </div>
      </details>
    </div>
  );
}
