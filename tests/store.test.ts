import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../electron/store";
import { portfolio } from "../src/domain/finance";
import { instrument, operation } from "./helpers";
import { syncDepositRates } from "../electron/sources";
import { today } from "../src/domain/types";
let dir: string;
let store: Store;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "invest-tests-"));
  store = new Store(join(dir, "invest.sqlite"));
});
afterEach(() => {
  store.close();
  const target = resolve(dir);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("invest-tests-")
  )
    throw new Error("Unsafe test cleanup path");
  rmSync(target, { recursive: true, force: true });
});
describe("SQLite и проверка входных данных", () => {
  it("автоставка сохраняет историю, задержку и кэш; сбой сети не стирает данные", async () => {
    const i = instrument({
      kind: "deposit",
      annualRate: 10.05,
      depositRate: {
        mode: "nbrb",
        spread: 5.05,
        floor: 0.1,
        lagDays: 1,
        history: [],
        checkedOn: "",
      },
    });
    store.saveInstrument(i);
    store.saveOperation({
      operation: operation({
        kind: "buy",
        instrumentId: i.id,
        quantity: 1000,
        price: 1,
      }),
      fundFromOutside: true,
    });
    let requests = 0;
    const fetcher = async () => {
      requests++;
      return '[{"Date":"2024-01-01T00:00:00","Value":5},{"Date":"2025-01-02T00:00:00","Value":10}]';
    };
    await syncDepositRates(store, false, fetcher);
    const saved = store.load().instruments[0];
    expect(saved.annualRate).toBe(15.05);
    expect(saved.depositRate?.history).toEqual([
      { date: "2024-01-02", rate: 10.05 },
      { date: "2025-01-03", rate: 15.05 },
    ]);
    expect(saved.depositRate?.checkedOn).toBe(today());
    await syncDepositRates(store, false, fetcher);
    expect(requests).toBe(1);
    await syncDepositRates(store, true, async () => {
      throw new Error("offline");
    });
    expect(store.load().instruments[0]).toEqual(saved);
    expect(store.load().syncRuns[0].status).toBe("error");
    expect(store.load().operations).toHaveLength(2);
    const path = join(dir, "rates.sqlite");
    await store.backup(path);
    await store.restore(path);
    expect(store.load().instruments[0]).toEqual(saved);
  });
  it("покупка со связанным пополнением сохраняется после перезапуска", () => {
    const i = instrument({
      kind: "deposit",
      provider: "Банк",
      autoAccrual: false,
    });
    store.saveInstrument(i);
    store.saveOperation({
      operation: operation({
        kind: "buy",
        provider: i.provider,
        instrumentId: i.id,
        quantity: 5000,
        price: 1,
      }),
      fundFromOutside: true,
    });
    store.close();
    store = new Store(join(dir, "invest.sqlite"));
    expect(store.load().operations).toHaveLength(2);
    expect(portfolio(store.load()).totalByn).toBe(5000);
    expect(
      store.load().operations.find((o) => o.kind === "buy")?.thesis.reason,
    ).toBe("Тестовая инвестиционная идея");
  });
  it("не принимает отрицательные числа, пустую причину, неверную дату и курс BYN", () => {
    const i = instrument();
    store.saveInstrument(i);
    for (const change of [
      { quantity: -1 },
      { thesis: { ...operation().thesis, reason: "" } },
      { date: "2025-02-30" },
      { fx: 3 },
    ])
      expect(() =>
        store.saveOperation({
          operation: operation({
            kind: "buy",
            instrumentId: i.id,
            quantity: 1,
            price: 100,
            ...change,
          }),
          fundFromOutside: true,
        }),
      ).toThrow();
    expect(store.load().operations).toHaveLength(0);
  });
  it("редактирование покупки не дублирует пополнение", () => {
    const i = instrument();
    store.saveInstrument(i);
    const o = operation({
      kind: "buy",
      instrumentId: i.id,
      quantity: 1,
      price: 100,
    });
    store.saveOperation({ operation: o, fundFromOutside: true });
    store.saveOperation({
      operation: { ...o, quantity: 2 },
      fundFromOutside: true,
    });
    expect(store.load().operations).toHaveLength(2);
    expect(portfolio(store.load()).depositsByn).toBe(200);
  });
  it("удаляет покупку вместе с пополнением и защищает связанный остаток", () => {
    const i = instrument();
    store.saveInstrument(i);
    const o = operation({
      kind: "buy",
      instrumentId: i.id,
      quantity: 2,
      price: 100,
    });
    store.saveOperation({ operation: o, fundFromOutside: true });
    const sale = operation({
      kind: "sell",
      instrumentId: i.id,
      quantity: 1,
      price: 110,
      date: "2025-02-01",
    });
    store.saveOperation({ operation: sale, fundFromOutside: false });
    expect(() => store.removeOperation(o.id)).toThrow();
    expect(store.load().operations).toHaveLength(3);
    store.removeOperation(sale.id);
    store.removeOperation(o.id);
    expect(store.load().operations).toHaveLength(0);
  });
  it("запрещает изменение типа валюты и счёта инструмента с историей", () => {
    const i = instrument();
    store.saveInstrument(i);
    store.saveOperation({
      operation: operation({
        kind: "buy",
        instrumentId: i.id,
        quantity: 1,
        price: 100,
      }),
      fundFromOutside: true,
    });
    expect(() => store.saveInstrument({ ...i, currency: "USD" })).toThrow();
    expect(() => store.removeInstrument(i.id)).toThrow();
  });
  it("сохраняет одну цену на дату без потери истории", () => {
    const i = instrument();
    store.saveInstrument(i);
    for (const price of [100, 110])
      store.saveQuote({
        id: randomUUID(),
        instrumentId: i.id,
        date: "2025-01-01",
        price,
        source: "manual",
      });
    expect(store.load().quotes).toHaveLength(1);
    expect(store.load().quotes[0].price).toBe(110);
  });
  it("восстанавливает валидную копию и не изменяет базу при повреждённом файле", async () => {
    const i = instrument();
    store.saveInstrument(i);
    const path = join(dir, "copy.sqlite");
    await store.backup(path);
    store.saveInstrument(instrument({ name: "Другой инструмент" }));
    expect(store.load().instruments).toHaveLength(2);
    await store.restore(path);
    expect(store.load().instruments).toHaveLength(1);
    const bad = join(dir, "bad.sqlite");
    writeFileSync(bad, "bad file");
    await expect(store.restore(bad)).rejects.toThrow();
    expect(store.load().instruments).toHaveLength(1);
  });
  it("покупка депозита использует денежные единицы с ценой 1", () => {
    const i = instrument({ kind: "deposit" });
    store.saveInstrument(i);
    expect(() =>
      store.saveOperation({
        operation: operation({
          kind: "buy",
          instrumentId: i.id,
          quantity: 1,
          price: 1000,
        }),
        fundFromOutside: true,
      }),
    ).toThrow("равна 1");
  });
});
