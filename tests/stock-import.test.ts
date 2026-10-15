import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  importStockResponses,
  readStockResponses,
  stockMarketSummary,
  terminalPriceHistory,
} from "../src/domain/stock-import";
import { stockAnalysisSchema } from "../src/domain/stock-schema";
import { stockMetrics, stockPrice } from "../src/domain/stocks";
const read = (name: string) =>
  JSON.parse(
    readFileSync(`tests/fixtures/aigenis-equity-${name}.json`, "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  );
const card = read("card"),
  history = read("history"),
  stats = read("stats");
const raw = [card, history, stats].map((v) => JSON.stringify(v)).join("\n\n");

describe("реальные ответы Aigenis: Беларусбанк Ап17", () => {
  it("объединяет 2 режима и 517 записей в одну акцию, импортирует статистику и сохраняет схему", () => {
    const result = importStockResponses(raw, []);
    expect(result.instruments).toHaveLength(1);
    expect(result.records).toBe(517);
    const i = result.instruments[0],
      p = i.stockAnalysis!;
    expect(p.market?.securityIds).toEqual(["2299", "60706"]);
    expect(stockPrice(i).value).toBe(2);
    expect(p.market?.ask).toBeNull();
    expect(p.market?.bid).toBeNull();
    expect(p.terminal?.trades).toHaveLength(517);
    expect(p.terminal?.historyComplete).toBe(true);
    expect(stockAnalysisSchema.safeParse(p).success).toBe(true);
    expect(stockMarketSummary(p)).toMatchObject({
      trades: 55,
      turnover: 3609.77,
      volume: 1869,
      last: { date: "2026-09-25", close: 2 },
    });
    expect(p.reports).toEqual([]);
    expect(stockMetrics(null, 2)).toMatchObject({
      pe: null,
      dividendYield: null,
      cap: null,
    });
  });
  it("принимает ответы в любом порядке, объединяет отдельные вставки и не стирает ручные данные", () => {
    let i = importStockResponses(JSON.stringify(card), []).instruments[0];
    i.stockAnalysis!.description = "Мои заметки";
    i.stockAnalysis!.history = [{ date: "2025-01-01", close: 3 }];
    i = importStockResponses(JSON.stringify(history), [i]).instruments[0];
    i = importStockResponses(JSON.stringify(stats), [i]).instruments[0];
    i = importStockResponses(JSON.stringify(card.results[0]), [i])
      .instruments[0];
    expect(i.stockAnalysis?.market?.securityIds).toEqual(["2299", "60706"]);
    expect(i.stockAnalysis?.terminal?.trades).toHaveLength(517);
    expect(i.stockAnalysis?.description).toBe("Мои заметки");
    expect(i.stockAnalysis?.history).toHaveLength(1);
    const reverse = importStockResponses(
      JSON.stringify([stats, history, card]),
      [],
    ).instruments[0];
    expect(reverse.stockAnalysis?.terminal?.stats.num_deals_30days).toBe(55);
    const repeat = importStockResponses(raw, [i]);
    expect(repeat.instruments[0].id).toBe(i.id);
    expect(repeat.instruments[0].stockAnalysis?.terminal?.trades).toHaveLength(
      517,
    );
  });
  it("принимает пакет расширения, не сохраняет незнакомые поля и требует правильную связь", () => {
    const bundle = {
      ...card,
      aigenis: {
        1113: {
          trade_stat: history,
          definition_stat: stats,
          details: {
            details: [
              {
                block_translated_name: "Основные",
                block_data: [{ name: "Тип", value: "Привилегированные" }],
              },
            ],
          },
        },
      },
      authorization: "must-not-store",
    };
    const i = importStockResponses(JSON.stringify(bundle), []).instruments[0];
    expect(JSON.stringify(i)).not.toContain("must-not-store");
    expect(i.stockAnalysis?.terminal?.details[0].value).toBe(
      "Привилегированные",
    );
    expect(() => importStockResponses(JSON.stringify(history), [])).toThrow(
      "торговому ID",
    );
    expect(() =>
      importStockResponses(
        JSON.stringify({ ...card, aigenis: { 1114: { trade_stat: history } } }),
        [],
      ),
    ).toThrow("разным акциям");
    expect(() => importStockResponses(JSON.stringify(stats), [])).toThrow(
      "1113",
    );
  });
  it("взвешивает одинаковую дату по объёму и не выдаёт неполную страницу за полную историю", () => {
    const rows = [
      {
        id: 1,
        trade_date: "2026-09-25",
        avg_w_price: 2,
        volume: 10,
        security_definition: 2299,
      },
      {
        id: 2,
        trade_date: "2026-09-25",
        avg_w_price: 3,
        volume: 30,
        security_definition: 60706,
      },
    ];
    const p = importStockResponses(
      JSON.stringify([
        card,
        { results: rows, pagination: { count: 3, next: "next" } },
      ]),
      [],
    ).instruments[0].stockAnalysis!;
    expect(terminalPriceHistory(p)).toEqual([
      { date: "2026-09-25", close: 2.75 },
    ]);
    expect(p.terminal?.historyComplete).toBe(false);
    p.terminal!.trades[0].volume = null;
    expect(terminalPriceHistory(p)).toEqual([]);
  });
  it("не принимает заголовки и обрезанный JSON", () => {
    expect(() => readStockResponses("Authorization: JWT secret\n{} ")).toThrow(
      "без HTTP",
    );
    expect(() => readStockResponses('{"results": [')).toThrow();
    expect(() => readStockResponses(" ")).toThrow();
  });
});
