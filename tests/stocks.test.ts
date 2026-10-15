import { describe, expect, it } from "vitest";
import {
  emptyStockAnalysis,
  stockAnalysisSchema,
  type StockReport,
} from "../src/domain/stock-schema";
import {
  equityValue,
  impliedGrowth,
  importedStockInstrument,
  parseStockHistory,
  parseTerminalStocks,
  stockMetrics,
  stockPrice,
  stockQuality,
  stockTechnicals,
} from "../src/domain/stocks";

// Synthetic API-shaped samples: no live equity response has been supplied yet.
const row = (extra: Record<string, unknown> = {}) => ({
  name_of_security: "Учебная акция",
  trading_session_id: "NDA",
  settl_currency: "BYN",
  best_offer: 102,
  best_bid: 100,
  round_lot: 1,
  definition: {
    id: 7,
    product: "stock",
    exchange: "BY_EXCHANGE",
    currency: "BYN",
    security_symbol: "TEST-EQUITY",
    nominal: 1,
    quantity: 999999,
    last_deal_price: 99,
    issuer: { full_name: "Учебный эмитент" },
  },
  ...extra,
});
const report: StockReport = {
  date: "2025-12-31",
  currency: "BYN",
  source: "Учебный отчёт",
  revenue: 1000,
  netIncome: 100,
  equity: 500,
  debt: 150,
  cash: 50,
  ebitda: 200,
  operatingCashFlow: 120,
  capex: 20,
  shares: 100,
  eps: null,
  bookValue: null,
  dividend: 0.5,
};
describe("акции: импорт и выбор цены", () => {
  it("различает акции и облигации, не выводит капитализацию из quantity", () => {
    const stocks = parseTerminalStocks(
      JSON.stringify({ results: [row(), { definition: { product: "bond" } }] }),
    );
    expect(stocks).toHaveLength(1);
    const i = importedStockInstrument(stocks[0]);
    expect(i.kind).toBe("stock");
    expect(i.stockAnalysis?.reports).toEqual([]);
    expect(stockPrice(i).value).toBe(102);
    expect(stockMetrics(null, 102).cap).toBeNull();
    expect(stockPrice(i).date).toBe("");
    expect(stockAnalysisSchema.safeParse(i.stockAnalysis).success).toBe(true);
  });
  it("при нулевом предложении использует последнюю сделку; не подставляет номинал", () => {
    const i = importedStockInstrument(
      parseTerminalStocks(JSON.stringify(row({ best_offer: 0 })))[0],
    );
    expect(stockPrice(i)).toMatchObject({
      value: 99,
      indicative: true,
      date: "",
    });
    i.stockAnalysis!.market!.last = null;
    expect(stockPrice(i).value).toBeNull();
  });
  it("режим REPO и другая валюта расчётов не дают цену покупки", () => {
    for (const extra of [
      { trading_session_id: "REPO" },
      { settl_currency: "USD" },
    ]) {
      const r = parseTerminalStocks(JSON.stringify(row(extra)))[0];
      expect(r.market.ask).toBeNull();
      expect(r.market.bid).toBeNull();
    }
  });
  it("выбирает биржевое предложение среди режимов и сохраняет собственный анализ при повторном импорте", () => {
    const a = parseTerminalStocks(
      JSON.stringify({ results: [row({ trading_session_id: "REPO" }), row()] }),
    );
    expect(a).toHaveLength(1);
    expect(a[0].market.ask).toBe(102);
    const old = importedStockInstrument(a[0]);
    old.stockAnalysis!.reports = [report];
    old.notes = "Идея";
    const saved = importedStockInstrument(a[0], old);
    expect(saved.id).toBe(old.id);
    expect(saved.stockAnalysis?.reports).toEqual([report]);
    expect(saved.notes).toBe("Идея");
  });
  it("отказывает на неверном или нерелевантном JSON", () => {
    expect(() => parseTerminalStocks("headers")).toThrow("JSON");
    expect(() =>
      parseTerminalStocks('{"results":[{"product":"bond"}]}'),
    ).toThrow("Акции не найдены");
  });
});
describe("акции: фундаментальные показатели", () => {
  it("согласует валюту, акции и агрегированные показатели", () => {
    const m = stockMetrics(report, 10);
    expect(m).toMatchObject({
      cap: 1000,
      eps: 1,
      pe: 10,
      pb: 2,
      ev: 1100,
      evEbitda: 5.5,
      dividendYield: 0.05,
      payout: 0.5,
      roe: 0.2,
      margin: 0.1,
      fcf: 100,
      fcfYield: 0.1,
    });
  });
  it("не трактует убыток/отрицательный капитал как дешёвый мультипликатор", () => {
    const m = stockMetrics(
      { ...report, netIncome: -10, equity: -10, ebitda: -5 },
      10,
    );
    expect(m.pe).toBeNull();
    expect(m.pb).toBeNull();
    expect(m.evEbitda).toBeNull();
    expect(m.earningsYield).toBe(-0.01);
    expect(stockMetrics(null, 10).dividendYield).toBeNull();
    expect(stockMetrics({ ...report, dividend: 0 }, 10).dividendYield).toBe(0);
  });
  it("показывает покрытие критериев и требует сопоставимых годовых периодов", () => {
    expect(stockQuality(null).every((s) => s.pass === null)).toBe(true);
    expect(
      stockQuality(report, { ...report, date: "2024-12-31", revenue: 900 }).at(
        -1,
      )?.pass,
    ).toBe(true);
    expect(
      stockQuality(report, { ...report, date: "2025-09-30", revenue: 900 }).at(
        -1,
      )?.pass,
    ).toBeNull();
    expect(
      stockQuality(report, {
        ...report,
        date: "2024-12-31",
        currency: "USD",
      }).at(-1)?.pass,
    ).toBeNull();
  });
});
describe("DCF, обратная оценка и чувствительность", () => {
  const v = {
    ...emptyStockAnalysis().valuation,
    cashFlow: 10,
    growth: 0,
    discount: 10,
    terminalGrowth: 0,
  };
  it("совпадает с вечной рентой при неизменном потоке", () => {
    expect(equityValue(v)?.value).toBeCloseTo(100, 10);
    expect(equityValue({ ...v, years: 10 })?.value).toBeCloseTo(100, 10);
    expect(equityValue({ ...v, model: "dividend" })?.value).toBeCloseTo(
      100,
      10,
    );
    expect(impliedGrowth(v, 100)).toBeCloseTo(0, 8);
  });
  it("восстанавливает известный рост и реагирует на ставку", () => {
    const value = equityValue({ ...v, growth: 12 })!.value;
    expect(impliedGrowth(v, value)).toBeCloseTo(12, 8);
    expect(equityValue({ ...v, discount: 15 })!.value).toBeLessThan(100);
    expect(equityValue({ ...v, terminalGrowth: 3 })!.value).toBeGreaterThan(
      100,
    );
  });
  it("не выдаёт результат для неустойчивой или неполной модели", () => {
    expect(equityValue({ ...v, cashFlow: null })).toBeNull();
    expect(equityValue({ ...v, cashFlow: -10 })).toBeNull();
    expect(equityValue({ ...v, terminalGrowth: 10 })).toBeNull();
    expect(equityValue({ ...v, years: 1.5 })).toBeNull();
    expect(impliedGrowth(v, 1e12)).toBeNull();
    expect(impliedGrowth(v, null)).toBeNull();
  });
});
describe("история котировок", () => {
  it("проверяет даты, дубликаты, положительность и сортирует", () => {
    expect(
      parseStockHistory("date;close\n2025-01-03;120\n2025-01-01;100")[0].close,
    ).toBe(100);
    expect(() => parseStockHistory("2025-02-30;100")).toThrow();
    expect(() => parseStockHistory("2025-01-01;0")).toThrow();
    expect(() => parseStockHistory("2025-01-01;1\n2025-01-01;2")).toThrow();
  });
  it("считает просадку от пика, Wilder RSI и минимальную длину", () => {
    const points = [100, 120, 90, 110].map((close, n) => ({
      date: `2025-01-0${n + 1}`,
      close,
    }));
    expect(stockTechnicals(points)).toMatchObject({
      drawdown: -0.25,
      rsi: null,
      sma50: null,
    });
    const rising = Array.from({ length: 50 }, (_, n) => ({
      date: new Date(Date.UTC(2025, 0, n + 1)).toISOString().slice(0, 10),
      close: n + 1,
    }));
    expect(stockTechnicals(rising)).toMatchObject({
      rsi: 100,
      sma50: 25.5,
      sma200: null,
    });
    expect(stockTechnicals(rising.map((p) => ({ ...p, close: 100 }))).rsi).toBe(
      50,
    );
  });
});
