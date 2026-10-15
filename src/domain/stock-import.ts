import type { Instrument } from "./types";
import { today } from "./types";
import {
  emptyStockAnalysis,
  stockTerminalSchema,
  stockTradeSchema,
  type StockAnalysis,
  type StockTerminal,
} from "./stock-schema";
import { importedStockInstrument, parseTerminalStocks } from "./stocks";
import { instrumentSchema } from "./validation";
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const str = (v: unknown, max = 100) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).trim().slice(0, max)
    : "";
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())
      ? Number(v)
      : null;
const nonnegative = (v: unknown) => {
  const n = number(v);
  return n !== null && n >= 0 ? n : null;
};
export const statFields = [
  "min_price_buy_orders_last_day",
  "max_price_buy_orders_last_day",
  "avg_w_price_buy_orders_last_day",
  "volume_buy_orders_last_day",
  "min_price_buy_orders_10days",
  "max_price_buy_orders_10days",
  "avg_w_price_buy_orders_10days",
  "avg_volume_buy_orders_10days",
  "min_price_sell_orders_last_day",
  "max_price_sell_orders_last_day",
  "avg_w_price_sell_orders_last_day",
  "volume_sell_orders_last_day",
  "min_price_sell_orders_10days",
  "max_price_sell_orders_10days",
  "avg_w_price_sell_orders_10days",
  "avg_volume_sell_orders_10days",
  "min_price_byn_last_day",
  "max_price_byn_last_day",
  "avg_w_price_byn_last_day",
  "num_deals_last_day",
  "total_size_last_day",
  "turnover_byn_last_day",
  "num_deals_last_10days",
  "num_deals_last_10days_rating_number",
  "min_price_byn_30days",
  "max_price_byn_30days",
  "avg_w_price_byn_30days",
  "num_deals_30days",
  "total_size_30days",
  "turnover_byn_30days",
] as const;

// Read one JSON, an array of responses, or several JSON documents pasted consecutively.
export function readStockResponses(raw: string): unknown[] {
  if (raw.length > 2_000_000) throw new Error("Максимум 2 МБ за вставку");
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [value];
  } catch {
    /* Try adjacent response documents. */
  }
  const output: unknown[] = [];
  let depth = 0,
    start = -1,
    quoted = false,
    escaped = false;
  for (let n = 0; n < raw.length; n++) {
    const c = raw[n];
    if (start < 0) {
      if (/\s/.test(c)) continue;
      if (c !== "{" && c !== "[")
        throw new Error("Нужен JSON Response, без HTTP-заголовков");
      start = n;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    if (depth === 0) {
      try {
        const value = JSON.parse(raw.slice(start, n + 1));
        output.push(...(Array.isArray(value) ? value : [value]));
      } catch {
        throw new Error("Некорректный JSON ответа");
      }
      start = -1;
    }
  }
  if (start >= 0 || !output.length)
    throw new Error("Вставьте полный JSON ответа");
  return output;
}
type Part = {
  definitionId?: string;
  kind: "history" | "stats" | "details";
  data: any;
};
export function importStockResponses(raw: string, instruments: Instrument[]) {
  const docs = readStockResponses(raw),
    cards: unknown[] = [],
    parts: Part[] = [];
  for (const value of docs) {
    const root = obj(value);
    const rows = Array.isArray(root.results) ? root.results : [root];
    for (const row of rows) {
      const d = obj(obj(row).definition);
      if (["stock", "share", "equity"].includes(d.product ?? obj(row).product))
        cards.push(row);
    }
    if (
      rows.some(
        (r) =>
          obj(r).trade_date !== undefined && obj(r).avg_w_price !== undefined,
      )
    )
      parts.push({
        kind: "history",
        data: root.results ? root : { results: rows },
      });
    if (
      rows.some(
        (r) =>
          obj(r).definition !== undefined &&
          statFields.some((f) => obj(r)[f] !== undefined),
      )
    )
      for (const r of rows)
        parts.push({
          kind: "stats",
          definitionId: str(obj(r).definition),
          data: r,
        });
    if (Array.isArray(root.details)) {
      const definitionId = str(root.definition_id ?? root.definition);
      if (!definitionId)
        throw new Error(
          "Для отдельных details нужен definition_id из адреса запроса. Удобнее скопировать карточку расширением целиком.",
        );
      parts.push({ kind: "details", definitionId, data: root });
    }
    for (const [definitionId, extra] of Object.entries(obj(root.aigenis))) {
      const e = obj(extra);
      if (e.trade_stat)
        parts.push({ kind: "history", definitionId, data: e.trade_stat });
      if (e.definition_stat) {
        const rows = Array.isArray(e.definition_stat.results)
          ? e.definition_stat.results
          : [e.definition_stat];
        for (const row of rows) {
          if (str(obj(row).definition) !== definitionId)
            throw new Error("Статистика относится к другой акции");
          parts.push({ kind: "stats", definitionId, data: row });
        }
      }
      if (e.details)
        parts.push({ kind: "details", definitionId, data: e.details });
    }
  }
  const working = new Map(
    instruments.filter((i) => i.kind === "stock").map((i) => [i.id, i]),
  );
  const changed = new Set<string>();
  if (cards.length) {
    for (const row of parseTerminalStocks(JSON.stringify({ results: cards }))) {
      const old = [...working.values()].find(
        (i) =>
          i.stockAnalysis?.market?.key === row.market.key ||
          (i.provider === "Aigenis" &&
            i.ticker === row.market.ticker &&
            i.currency === row.market.currency),
      );
      const value = importedStockInstrument(row, old);
      working.set(value.id, value);
      changed.add(value.id);
    }
  }
  let records = 0;
  const update = (i: Instrument, fn: (t: StockTerminal) => void) => {
    const p = i.stockAnalysis ?? emptyStockAnalysis();
    const m = p.market!;
    const t: StockTerminal = structuredClone(
      p.terminal ?? {
        definitionId: m.definitionId,
        importedAt: new Date().toISOString(),
        trades: [],
        historyComplete: false,
        stats: {},
        details: [],
      },
    );
    fn(t);
    t.importedAt = new Date().toISOString();
    const terminal = stockTerminalSchema.parse(t);
    working.set(i.id, { ...i, stockAnalysis: { ...p, terminal } });
    changed.add(i.id);
  };
  for (const part of parts) {
    if (part.kind === "history") {
      const rows = Array.isArray(part.data.results) ? part.data.results : [];
      if (rows.length > 5000) throw new Error("Максимум 5000 записей истории");
      const grouped = new Map<string, any[]>();
      for (const rawRow of rows) {
        const r = obj(rawRow);
        const securityId = str(r.security_definition);
        const candidates = [...working.values()].filter((i) =>
          i.stockAnalysis?.market?.securityIds?.includes(securityId),
        );
        if (candidates.length !== 1)
          throw new Error(
            `История относится к торговому ID ${securityId || "неизвестно"}. Сначала вставьте полный список security_definition этой акции вместе с историей.`,
          );
        const i = candidates[0];
        if (
          part.definitionId &&
          i.stockAnalysis!.market!.definitionId !== part.definitionId
        )
          throw new Error("История и карточка относятся к разным акциям");
        const price = number(r.avg_w_price);
        if (price === null || price <= 0) continue;
        const parsed = stockTradeSchema.parse({
          id: str(r.id) || `${securityId}:${r.trade_date}`,
          securityId,
          date: str(r.trade_date, 10),
          price,
          min: (number(r.min_price) ?? 0) > 0 ? number(r.min_price) : null,
          max: (number(r.max_price) ?? 0) > 0 ? number(r.max_price) : null,
          count: nonnegative(r.trades_count),
          volume: nonnegative(r.volume),
        });
        const list = grouped.get(i.id) ?? [];
        list.push(parsed);
        grouped.set(i.id, list);
      }
      for (const [id, values] of grouped) {
        const current = working.get(id)!;
        update(current, (t) => {
          const merged = new Map(
            t.trades.map((r) => [`${r.securityId}:${r.date}`, r]),
          );
          for (const r of values) merged.set(`${r.securityId}:${r.date}`, r);
          t.trades = [...merged.values()].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          t.historyComplete =
            part.data.pagination?.next === null &&
            part.data.pagination?.count === rows.length;
        });
        records += values.length;
      }
    } else {
      const matches = [...working.values()].filter(
        (i) => i.stockAnalysis?.market?.definitionId === part.definitionId,
      );
      if (matches.length !== 1)
        throw new Error(
          `Для данных definition=${part.definitionId} сначала добавьте карточку акции`,
        );
      update(matches[0], (t) => {
        if (part.kind === "stats") {
          t.statsImportedAt = new Date().toISOString();
          for (const key of statFields) {
            const n = nonnegative(part.data[key]);
            if (n !== null) t.stats[key] = n;
          }
        } else {
          t.details = (
            Array.isArray(part.data.details) ? part.data.details : []
          )
            .flatMap((block: any) =>
              (Array.isArray(block?.block_data)
                ? block.block_data
                : []
              ).flatMap((field: any) => {
                const label = str(field?.name, 200),
                  value = str(field?.value, 2000);
                return label && value
                  ? [
                      {
                        block: str(block.block_translated_name, 200),
                        label,
                        value,
                      },
                    ]
                  : [];
              }),
            )
            .slice(0, 100);
        }
      });
    }
  }
  if (!changed.size)
    throw new Error(
      "Акции не найдены. Нужны карточки акций, история trade_stat или статистика definition_stat",
    );
  // Validate the entire plan before callers write its first instrument.
  return {
    instruments: [...changed].map((id) =>
      instrumentSchema.parse(working.get(id)!),
    ),
    records,
  };
}
/** Aigenis supplies daily volume-weighted prices, not closing prices. Never relabel these as closes. */
export function terminalPriceHistory(profile: StockAnalysis) {
  const grouped = new Map<string, StockTerminal["trades"]>();
  for (const row of profile.terminal?.trades ?? []) {
    const a = grouped.get(row.date) ?? [];
    a.push(row);
    grouped.set(row.date, a);
  }
  return [...grouped]
    .flatMap(([date, rows]) => {
      if (rows.length === 1) return [{ date, close: rows[0].price }];
      if (rows.some((r) => r.volume === null || r.volume <= 0)) return [];
      const volume = rows.reduce((s, r) => s + r.volume!, 0);
      return [
        {
          date,
          close: rows.reduce((s, r) => s + r.price * r.volume!, 0) / volume,
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function stockMarketSummary(profile: StockAnalysis) {
  const history = terminalPriceHistory(profile),
    last = history.at(-1),
    stats = profile.terminal?.stats ?? {};
  const days = last
    ? Math.floor((Date.parse(today()) - Date.parse(last.date)) / 86400000)
    : null;
  const trades = stats.num_deals_30days ?? null;
  return {
    history,
    last,
    days,
    trades,
    volume: stats.total_size_30days ?? null,
    turnover: stats.turnover_byn_30days ?? null,
    liquidity:
      trades === null
        ? "Нет статистики ликвидности"
        : trades === 0
          ? "Сделок за 30 дней нет"
          : trades < 30
            ? "Редкие сделки"
            : trades < 150
              ? "Ограниченная ликвидность"
              : "Активные торги по числу сделок",
  };
}
