import { randomUUID } from "node:crypto";
import type { Instrument, Operation, State } from "../src/domain/types";
import { emptyThesis } from "../src/domain/types";
export function instrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: randomUUID(),
    name: "Тестовый инструмент",
    ticker: "",
    kind: "stock",
    provider: "Aigenis",
    currency: "BYN",
    nominal: 100,
    annualRate: 10,
    maturity: "",
    frequency: 2,
    nextPayment: "",
    capitalization: false,
    notes: "",
    sourceUrl: "",
    eps: null,
    bookValue: null,
    debt: null,
    equity: null,
    revenue: null,
    netIncome: null,
    reportDate: "",
    ...overrides,
  };
}
export function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: randomUUID(),
    instrumentId: "",
    kind: "deposit",
    provider: "Aigenis",
    currency: "BYN",
    date: "2025-01-01",
    quantity: 0,
    price: 0,
    amount: 1000,
    fee: 0,
    fx: 1,
    thesis: { ...emptyThesis(), reason: "Тестовая инвестиционная идея" },
    note: "",
    createdAt: "2025-01-01T12:00:00.000Z",
    ...overrides,
  };
}
export function state(overrides: Partial<State> = {}): State {
  return {
    instruments: [],
    operations: [],
    quotes: [],
    fxRates: [],
    catalog: [],
    syncRuns: [],
    settings: { baseCurrency: "BYN", benchmarkRate: 10 },
    dbPath: "",
    ...overrides,
  };
}
