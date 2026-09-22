import { describe, expect, it } from "vitest";
import { depositAccrual, depositRateAt } from "../src/domain/deposit";
import { portfolio } from "../src/domain/finance";
import { instrument, operation, state } from "./helpers";

function fixture() {
  const i = instrument({
    kind: "deposit",
    annualRate: 14.3,
    frequency: 12,
    nextPayment: "2026-09-23",
    maturity: "2029-09-23",
  });
  const buy = operation({
    kind: "buy",
    instrumentId: i.id,
    date: "2026-08-23",
    quantity: 1500,
    price: 1,
  });
  const funding = operation({ date: buy.date, amount: 1500 });
  return { i, buy, funding };
}
describe("Автоматическое начисление процентов", () => {
  it("31 прошедший день: доход и XIRR растут без фиктивной выплаты", () => {
    const { i, buy, funding } = fixture();
    const s = state({ instruments: [i], operations: [funding, buy] });
    const p = portfolio(s, "2026-09-23", true);
    expect(p.accruedByn).toBe(18.22);
    expect(p.totalByn).toBe(1518.22);
    expect(p.profitByn).toBeCloseTo(18.22);
    expect(p.annualReturn).toBeCloseTo((1518.22 / 1500) ** (365 / 31) - 1, 9);
    expect(p.incomeByn).toBe(0);
    expect(p.cashByn).toBe(0);
    expect(s.operations).toHaveLength(2);
    expect(portfolio(s, "2026-09-24").accruedByn).toBeGreaterThan(18.22);
  });
  it("подтверждение выплаты и вывод на карту не удваивают доход", () => {
    const { i, buy, funding } = fixture();
    const income = operation({
      kind: "income",
      instrumentId: i.id,
      amount: 18.22,
      fee: 0.22,
      date: "2026-09-23",
    });
    const out = operation({
      kind: "withdrawal",
      amount: 18,
      date: income.date,
      createdAt: "2026-09-23T13:00:00.000Z",
    });
    const p = portfolio(
      state({ instruments: [i], operations: [funding, buy, income, out] }),
      income.date,
      true,
    );
    expect(p.accruedByn).toBe(0);
    expect(p.incomeByn).toBe(18);
    expect(p.profitByn).toBe(18);
    expect(p.totalByn).toBe(1500);
  });
  it("учитывает частично подтверждённый доход и не создаёт отрицательное начисление", () => {
    const { i, buy } = fixture();
    expect(
      depositAccrual(
        i,
        [
          buy,
          operation({
            kind: "income",
            instrumentId: i.id,
            amount: 10,
            date: "2026-09-23",
          }),
        ],
        "2026-09-23",
      ).unrecorded,
    ).toBe(8.22);
    expect(
      depositAccrual(
        i,
        [
          buy,
          operation({
            kind: "income",
            instrumentId: i.id,
            amount: 20,
            date: "2026-09-23",
          }),
        ],
        "2026-09-23",
      ).unrecorded,
    ).toBe(0);
  });
  it("до открытия и в день открытия нет процентов; после погашения рост прекращается", () => {
    const { i, buy } = fixture();
    i.maturity = "2026-09-23";
    expect(depositAccrual(i, [buy], "2026-08-22").earned).toBe(0);
    expect(depositAccrual(i, [buy], buy.date).earned).toBe(0);
    expect(depositAccrual(i, [buy], "2027-09-23").earned).toBe(18.22);
    expect(depositAccrual(i, [buy], i.maturity).perDay).toBe(0);
  });
  it("фактический остаток: взнос начинает работать в тот же день, снятие прекращает начисление", () => {
    const i = instrument({ kind: "deposit", annualRate: 36.5 });
    const buy = operation({
      kind: "buy",
      instrumentId: i.id,
      quantity: 1000,
      price: 1,
    });
    const topup = { ...buy, id: "topup", date: "2025-01-11" };
    const sale = {
      ...buy,
      id: "sale",
      kind: "sell" as const,
      date: "2025-01-16",
    };
    const future = { ...buy, id: "future", date: "2025-02-01" };
    expect(
      depositAccrual(i, [buy, topup, sale, future], "2025-01-21").earned,
    ).toBe(25);
  });
  it("на границе високосного года применяет 366 и 365 отдельно", () => {
    const i = instrument({ kind: "deposit", annualRate: 36.6 });
    const buy = operation({
      kind: "buy",
      instrumentId: i.id,
      date: "2024-12-31",
      quantity: 1000,
      price: 1,
    });
    expect(depositAccrual(i, [buy], "2025-01-02").earned).toBe(2);
    expect(depositAccrual(i, [buy], "2025-01-02").perDay).toBeCloseTo(
      366 / 365,
    );
  });
  it("изменение ставки применяется с даты истории, прошлое не пересчитывается по новой ставке", () => {
    const i = instrument({
      kind: "deposit",
      annualRate: 73,
      depositRate: {
        mode: "nbrb",
        spread: 0,
        floor: 0,
        lagDays: 1,
        history: [
          { date: "2025-01-01", rate: 36.5 },
          { date: "2025-01-11", rate: 73 },
        ],
        checkedOn: "2025-01-21",
      },
    });
    const buy = operation({
      kind: "buy",
      instrumentId: i.id,
      quantity: 1000,
      price: 1,
    });
    expect(depositRateAt(i, "2025-01-10")).toBe(36.5);
    expect(depositAccrual(i, [buy], "2025-01-21").earned).toBe(30);
    expect(depositAccrual(i, [buy], "2025-01-22").warnings.join()).toContain(
      "пока используется сохранённая история",
    );
  });
  it("капитализирует только по графику; ручная капитализация не удваивает тело вклада", () => {
    const i = instrument({
      kind: "deposit",
      annualRate: 1,
      capitalization: true,
      frequency: 12,
      nextPayment: "2025-02-01",
    });
    const buy = operation({
      kind: "buy",
      instrumentId: i.id,
      quantity: 36500,
      price: 1,
    });
    const automatic = depositAccrual(i, [buy], "2025-02-02");
    expect(automatic.earned).toBe(32);
    expect(automatic.perDay).toBeCloseTo((36531 * 0.01) / 365);
    const income = operation({
      kind: "income",
      instrumentId: i.id,
      date: "2025-02-01",
      amount: 31,
    });
    const reinvest = operation({
      kind: "buy",
      instrumentId: i.id,
      date: income.date,
      quantity: 31,
      price: 1,
    });
    const confirmed = depositAccrual(i, [buy, income, reinvest], "2025-02-02");
    expect(confirmed.perDay).toBeCloseTo(automatic.perDay);
    expect(confirmed.unrecorded).toBe(1);
  });
  it("можно отключить оценку; нехватка курса не скрывается", () => {
    const { i, buy, funding } = fixture();
    expect(
      depositAccrual({ ...i, autoAccrual: false }, [buy], "2026-09-23").earned,
    ).toBe(0);
    const p = portfolio(
      state({
        instruments: [{ ...i, currency: "USD" }],
        operations: [funding, buy].map((o) => ({
          ...o,
          currency: "USD",
          fx: 3,
        })),
      }),
      "2026-09-23",
    );
    expect(p.totalByn).toBeNull();
    expect(p.accruedByn).toBeNull();
  });
});
