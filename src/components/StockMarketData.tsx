import { useMemo } from "react";
import type { StockAnalysis } from "../domain/stock-schema";
import { stockMarketSummary } from "../domain/stock-import";
import { Metric, dateLabel, money, num } from "./ui";

export default function StockMarketData({
  profile,
  showHistory,
}: {
  profile: StockAnalysis;
  showHistory: () => void;
}) {
  const data = useMemo(() => stockMarketSummary(profile), [profile]);
  const terminal = profile.terminal,
    stats = terminal?.stats ?? {};
  if (!terminal)
    return (
      <p className="notice">
        Карточка загружена. Дополните её ответами «История торгов» и
        «Статистика» через кнопку «Вставить из Aigenis».
      </p>
    );
  const metrics: [string, string][] = [
    [
      "Сделок за последний торговый день",
      num(stats.num_deals_last_day ?? null, 0),
    ],
    [
      "Акций за последний торговый день",
      num(stats.total_size_last_day ?? null, 0),
    ],
    [
      "Оборот за последний торговый день",
      money(stats.turnover_byn_last_day ?? null, "BYN"),
    ],
    ["Сделок за 10 дней", num(stats.num_deals_last_10days ?? null, 0)],
    ["Объём за 30 дней, акций", num(data.volume, 0)],
    [
      "Средневзвешенная цена за 30 дней",
      money(stats.avg_w_price_byn_30days ?? null, "BYN"),
    ],
    [
      "Цены сделок за 30 дней, BYN",
      `${num(stats.min_price_byn_30days ?? null)} — ${num(stats.max_price_byn_30days ?? null)}`,
    ],
    [
      "Заявки покупателей за последний день, BYN",
      `${num(stats.min_price_buy_orders_last_day ?? null)} — ${num(stats.max_price_buy_orders_last_day ?? null)}`,
    ],
    [
      "Заявки продавцов за последний день, BYN",
      `${num(stats.min_price_sell_orders_last_day ?? null)} — ${num(stats.max_price_sell_orders_last_day ?? null)}`,
    ],
  ];
  return (
    <section className="page-stack stock-market-data">
      <div className="section-heading">
        <div>
          <h3>Торги и ликвидность</h3>
          <p>{data.liquidity}</p>
        </div>
        {data.history.length > 0 && (
          <button className="text-button" onClick={showHistory}>
            График и риск →
          </button>
        )}
      </div>
      <div className="analysis-metrics">
        <Metric
          label="Сделок за 30 дней"
          value={num(data.trades, 0)}
          hint="Количество исполненных сделок по снимку Aigenis"
        />
        <Metric
          label="Оборот за 30 дней"
          value={money(data.turnover, "BYN")}
          hint="Сумма сделок на рынке, не размер компании"
        />
        <Metric
          label="Последний день в истории"
          value={data.last ? dateLabel(data.last.date) : "История не загружена"}
          hint={
            data.days === null
              ? "Загрузите trade_stat"
              : `${data.days} дн. назад · ${terminal.trades.length} записей`
          }
        />
      </div>
      {(!profile.market?.ask || !profile.market.bid) && (
        <p className="notice warning">
          В снимке нет двухсторонних котировок. Последняя сделка — ориентир;
          возможность купить или продать по этой цене не подтверждена.
        </p>
      )}
      <details>
        <summary>Подробная статистика торгов</summary>
        <div className="detail-grid compact">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <p className="footnote">
          Заявки за прошлый день не являются текущим стаканом. Оценка
          ликвидности по числу сделок за 30 дней: 0 — нет сделок, 1–29 — редкие,
          30–149 — ограниченная, от 150 — активные по числу сделок. Объём и
          доступные котировки нужно оценивать отдельно. Статистика получена при
          импорте {dateLabel(terminal.statsImportedAt ?? terminal.importedAt)};
          дата её расчёта не передана источником.
        </p>
      </details>
    </section>
  );
}
