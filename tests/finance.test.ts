import { describe, expect, it } from "vitest";
import {
  addMonths,
  depositProjection,
  paymentSchedule,
  portfolio,
  technicals,
  xirr,
} from "../src/domain/finance";
import { instrument, operation, state } from "./helpers";
describe("Финансовый учёт", () => {
  it("пополнение не создаёт прибыль", () => {
    const p = portfolio(state({ operations: [operation()] }), "2025-12-31");
    expect(p.totalByn).toBe(1000);
    expect(p.profitByn).toBe(0);
    expect(p.annualReturn).toBeCloseTo(0, 8);
  });
  it("вклад учитывает только полученные проценты, а не прогноз", () => {
    const i = instrument({ kind: "deposit", provider: "Банк" });
    const p = portfolio(
      state({
        instruments: [i],
        operations: [
          operation({ provider: "Банк" }),
          operation({
            kind: "buy",
            instrumentId: i.id,
            provider: "Банк",
            quantity: 1000,
            price: 1,
          }),
          operation({
            kind: "income",
            instrumentId: i.id,
            provider: "Банк",
            amount: 100,
            date: "2025-12-31",
          }),
        ],
      }),
      "2025-12-31",
    );
    expect(p.totalByn).toBe(1100);
    expect(p.profitByn).toBe(100);
    expect(p.incomeByn).toBe(100);
  });
  it("учитывает комиссии и среднюю стоимость при частичной продаже", () => {
    const i = instrument();
    const p = portfolio(
      state({
        instruments: [i],
        operations: [
          operation({ amount: 2000 }),
          operation({
            kind: "buy",
            instrumentId: i.id,
            quantity: 10,
            price: 100,
            fee: 10,
          }),
          operation({
            kind: "sell",
            instrumentId: i.id,
            quantity: 4,
            price: 120,
            fee: 4,
            date: "2025-02-01",
          }),
        ],
        quotes: [
          {
            id: "q",
            instrumentId: i.id,
            date: "2025-02-01",
            price: 130,
            source: "test",
          },
        ],
      }),
      "2025-02-01",
      true,
    );
    expect(p.positions[0].cost).toBeCloseTo(606);
    expect(p.realizedByn).toBeCloseTo(72);
    expect(p.cashByn).toBeCloseTo(1466);
    expect(p.profitByn).toBeCloseTo(246);
    expect(p.feesByn).toBe(14);
  });
  it("не допускает короткую продажу или отрицательный денежный остаток", () => {
    const i = instrument();
    expect(() =>
      portfolio(
        state({
          instruments: [i],
          operations: [
            operation({
              kind: "sell",
              instrumentId: i.id,
              quantity: 1,
              price: 100,
            }),
          ],
        }),
        "2025-02-01",
        true,
      ),
    ).toThrow("больше остатка");
    expect(() =>
      portfolio(
        state({
          instruments: [i],
          operations: [
            operation({
              kind: "buy",
              instrumentId: i.id,
              quantity: 1,
              price: 100,
            }),
          ],
        }),
        "2025-02-01",
        true,
      ),
    ).toThrow("Недостаточно");
  });
  it("не смешивает счета", () => {
    expect(() =>
      portfolio(
        state({
          operations: [
            operation(),
            operation({
              kind: "withdrawal",
              provider: "Finstore",
              amount: 100,
            }),
          ],
        }),
        "2025-02-01",
        true,
      ),
    ).toThrow("Finstore");
  });
  it("учитывает исторический курс вложений и текущий курс стоимости", () => {
    const i = instrument({ currency: "USD" });
    const p = portfolio(
      state({
        instruments: [i],
        operations: [
          operation({ currency: "USD", fx: 3, amount: 100 }),
          operation({
            kind: "buy",
            instrumentId: i.id,
            currency: "USD",
            fx: 3,
            quantity: 1,
            price: 100,
          }),
        ],
        quotes: [
          {
            id: "q",
            instrumentId: i.id,
            date: "2025-02-01",
            price: 110,
            source: "test",
          },
        ],
        fxRates: [
          { currency: "USD", rate: 3.2, date: "2025-02-01", source: "test" },
        ],
      }),
      "2025-02-01",
    );
    expect(p.totalByn).toBeCloseTo(352);
    expect(p.profitByn).toBeCloseTo(52);
    expect(p.positions[0].fxImpactByn).toBeCloseTo(20);
  });
  it("не подставляет единицу вместо неизвестного курса", () => {
    const p = portfolio(
      state({ operations: [operation({ currency: "USD", fx: 3 })] }),
      "2025-01-01",
    );
    expect(p.totalByn).toBeNull();
    expect(p.profitByn).toBeNull();
    expect(p.warnings.join()).toContain("Нет курса USD");
  });
  it("нулевой остаток не требует валютного курса", () => {
    const p = portfolio(
      state({
        operations: [
          operation({ currency: "USD", fx: 3 }),
          operation({
            kind: "withdrawal",
            currency: "USD",
            fx: 3,
            date: "2025-02-01",
          }),
        ],
      }),
      "2025-02-01",
    );
    expect(p.totalByn).toBe(0);
  });
  it("цена без котировок помечена как оценка", () => {
    const i = instrument();
    const p = portfolio(
      state({
        instruments: [i],
        operations: [
          operation(),
          operation({
            kind: "buy",
            instrumentId: i.id,
            quantity: 2,
            price: 100,
          }),
        ],
      }),
      "2025-01-01",
    );
    expect(p.positions[0].estimated).toBe(true);
    expect(p.warnings.join()).toContain("стоимости покупки");
  });
  it("вывод дохода не обнуляет результат", () => {
    const i = instrument({ kind: "deposit" });
    const p = portfolio(
      state({
        instruments: [i],
        operations: [
          operation(),
          operation({
            kind: "buy",
            instrumentId: i.id,
            quantity: 1000,
            price: 1,
          }),
          operation({
            kind: "income",
            instrumentId: i.id,
            amount: 100,
            date: "2025-02-01",
          }),
          operation({ kind: "withdrawal", amount: 100, date: "2025-03-01" }),
        ],
      }),
      "2025-03-01",
    );
    expect(p.profitByn).toBe(100);
  });
});
describe("Доходности и прогнозы", () => {
  it("XIRR 10% за ровно 365 дней", () =>
    expect(
      xirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2026-01-01", amount: 1100 },
      ]),
    ).toBeCloseTo(0.1, 9));
  it("XIRR с несколькими взносами", () =>
    expect(
      xirr([
        { date: "2024-01-01", amount: -1000 },
        { date: "2025-01-01", amount: -1000 },
        { date: "2026-01-01", amount: 2310 },
      ]),
    ).toBeCloseTo(0.1, 3));
  it("нет мнимой доходности при отсутствии периода или неоднозначных потоках", () => {
    expect(
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2025-01-01", amount: 101 },
      ]),
    ).toBeNull();
    expect(
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2025-02-01", amount: 200 },
        { date: "2025-03-01", amount: -50 },
      ]),
    ).toBeNull();
  });
  it("простые и капитализированные проценты", () => {
    expect(depositProjection(1000, 12, 365)).toBe(120);
    expect(depositProjection(1000, 12, 365, true)).toBeCloseTo(126.82503, 4);
  });
  it("месяцы сохраняют исходный день после февраля", () => {
    expect(addMonths("2025-01-31", 1, 31)).toBe("2025-02-28");
    expect(addMonths("2025-02-28", 1, 31)).toBe("2025-03-31");
  });
  it("регулярные купоны, возврат номинала и отдельный прогноз", () => {
    const i = instrument({
      kind: "bond",
      nominal: 100,
      annualRate: 10,
      nextPayment: "2025-06-30",
      maturity: "2025-12-30",
      frequency: 2,
    });
    const flow = paymentSchedule(i, 10, "2025-01-01");
    expect(flow.map((f) => f.amount)).toEqual([50, 50, 1000]);
    expect(flow.map((f) => f.date)).toEqual([
      "2025-06-30",
      "2025-12-30",
      "2025-12-30",
    ]);
  });
  it("не выдумывает неизвестный график выплат", () => {
    const flow = paymentSchedule(
      instrument({ kind: "bond", maturity: "2026-01-01" }),
      10,
      "2025-01-01",
    );
    expect(flow).toHaveLength(1);
    expect(flow[0].amount).toBe(1000);
  });
  it("индикаторы требуют достаточного количества наблюдений", () => {
    expect(technicals([10, 11]).rsi).toBeNull();
    expect(technicals(Array(15).fill(10)).rsi).toBe(50);
    expect(technicals(Array.from({ length: 50 }, (_, i) => i + 1))).toEqual({
      sma20: 40.5,
      sma50: 25.5,
      rsi: 100,
    });
  });
});
