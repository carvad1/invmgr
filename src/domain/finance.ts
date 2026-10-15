import Decimal from "decimal.js";
import type { Currency, Instrument, Operation, State } from "./types";
import { today } from "./types";
import { depositAccrual } from "./deposit";
const D = (v: number) => new Decimal(v);
export const rounded = (v: number, places = 8) =>
  D(v).toDecimalPlaces(places).toNumber();
export const daysBetween = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 86400000;
export function sortOperations(ops: Operation[]) {
  return [...ops].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.localeCompare(b.createdAt) ||
      Number(b.kind === "deposit") - Number(a.kind === "deposit") ||
      a.id.localeCompare(b.id),
  );
}
export function operationValue(o: Operation) {
  return o.kind === "buy" || o.kind === "sell"
    ? D(o.quantity).mul(o.price).toNumber()
    : o.amount;
}
export interface Position {
  instrument: Instrument;
  quantity: number;
  cost: number;
  costByn: number;
  realizedByn: number;
  incomeByn: number;
  feesByn: number;
  price: number;
  priceDate: string;
  estimated: boolean;
  valueByn: number | null;
  unrealizedByn: number | null;
  fxImpactByn: number | null;
  accruedByn: number | null;
  accrued: number;
  dailyInterest: number;
}
export interface Cash {
  provider: string;
  currency: Currency;
  amount: number;
  valueByn: number | null;
}
export function fxAt(state: State, currency: Currency, asOf: string) {
  if (currency === "BYN") return { rate: 1, date: asOf, source: "BYN" };
  return (
    state.fxRates
      .filter((r) => r.currency === currency && r.date <= asOf)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}
export function portfolio(state: State, asOf = today(), validate = false) {
  const positions = new Map<string, Position>();
  for (const instrument of state.instruments)
    positions.set(instrument.id, {
      instrument,
      quantity: 0,
      cost: 0,
      costByn: 0,
      realizedByn: 0,
      incomeByn: 0,
      feesByn: 0,
      price: 0,
      priceDate: "",
      estimated: false,
      valueByn: 0,
      unrealizedByn: 0,
      fxImpactByn: 0,
      accruedByn: 0,
      accrued: 0,
      dailyInterest: 0,
    });
  const balances = new Map<string, Cash>();
  let depositsByn = 0,
    withdrawalsByn = 0,
    feesByn = 0;
  const flows: { date: string; amount: number }[] = [];
  for (const o of sortOperations(
    state.operations.filter((o) => o.date <= asOf),
  )) {
    const key = `${o.provider}\u0000${o.currency}`;
    const cash = balances.get(key) ?? {
      provider: o.provider,
      currency: o.currency,
      amount: 0,
      valueByn: 0,
    };
    const p = positions.get(o.instrumentId);
    const value = operationValue(o);
    if (o.instrumentId && !p) throw new Error("Инструмент операции не найден");
    if (
      p &&
      (p.instrument.provider !== o.provider ||
        p.instrument.currency !== o.currency)
    )
      throw new Error("Валюта или счёт операции не совпадает с инструментом");
    let delta = 0;
    if (o.kind === "deposit") {
      delta = value;
      depositsByn += value * o.fx;
      flows.push({ date: o.date, amount: -value * o.fx });
    }
    if (o.kind === "withdrawal") {
      delta = -value;
      withdrawalsByn += value * o.fx;
      flows.push({ date: o.date, amount: value * o.fx });
    }
    if (o.kind === "fee") delta = -value;
    if (o.kind === "buy" && p) {
      p.quantity = D(p.quantity).plus(o.quantity).toNumber();
      p.cost = D(p.cost).plus(value).plus(o.fee).toNumber();
      p.costByn = D(p.costByn).plus(D(value).plus(o.fee).mul(o.fx)).toNumber();
      delta = -value;
    }
    if (o.kind === "sell" && p) {
      if (D(o.quantity).minus(p.quantity).gt(0.00000001))
        throw new Error(
          `Нельзя продать больше остатка: ${p.instrument.name} (${o.date})`,
        );
      const ratio = p.quantity ? o.quantity / p.quantity : 0;
      p.realizedByn += (value - o.fee) * o.fx - p.costByn * ratio;
      p.cost *= 1 - ratio;
      p.costByn *= 1 - ratio;
      p.quantity = rounded(p.quantity - o.quantity);
      delta = value;
    }
    if (o.kind === "income" && p) {
      p.incomeByn += (value - o.fee) * o.fx;
      delta = value;
    }
    cash.amount = rounded(D(cash.amount).plus(delta).minus(o.fee).toNumber());
    if (validate && cash.amount < -0.00000001)
      throw new Error(
        `Недостаточно ${o.currency} на счёте «${o.provider}» на ${o.date}. Добавьте пополнение или отметьте внесение денег извне.`,
      );
    const fee = (o.fee + (o.kind === "fee" ? value : 0)) * o.fx;
    feesByn += fee;
    if (p) p.feesByn += fee;
    balances.set(key, cash);
  }
  const warnings = new Set<string>();
  for (const p of positions.values()) {
    const accrual = depositAccrual(p.instrument, state.operations, asOf);
    p.accrued = accrual.unrecorded;
    p.dailyInterest = accrual.perDay;
    const accrualFx = fxAt(state, p.instrument.currency, asOf);
    p.accruedByn = p.accrued
      ? accrualFx
        ? p.accrued * accrualFx.rate
        : null
      : 0;
    for (const warning of accrual.warnings)
      warnings.add(`${p.instrument.name}: ${warning}`);
    if (p.accruedByn === null)
      warnings.add(
        `Нет курса ${p.instrument.currency} к BYN для начисленных процентов`,
      );
    if (p.quantity <= 0) continue;
    const q = state.quotes
      .filter((q) => q.instrumentId === p.instrument.id && q.date <= asOf)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    p.price =
      p.instrument.kind === "deposit" ? 1 : (q?.price ?? p.cost / p.quantity);
    p.priceDate = q?.date ?? "";
    p.estimated = p.instrument.kind !== "deposit" && !q;
    if (p.estimated)
      warnings.add(
        `${p.instrument.name}: оценка по стоимости покупки, рыночной цены нет`,
      );
    if (q && daysBetween(q.date, asOf) > 7)
      warnings.add(`${p.instrument.name}: цена от ${q.date}`);
    const fx = fxAt(state, p.instrument.currency, asOf);
    if (!fx) {
      p.valueByn = null;
      p.unrealizedByn = null;
      p.fxImpactByn = null;
      warnings.add(`Нет курса ${p.instrument.currency} к BYN`);
    } else {
      p.valueByn = p.quantity * p.price * fx.rate;
      p.unrealizedByn = p.valueByn - p.costByn;
      p.fxImpactByn = p.cost * fx.rate - p.costByn;
      if (daysBetween(fx.date, asOf) > 7)
        warnings.add(`${p.instrument.currency}: курс от ${fx.date}`);
    }
  }
  for (const cash of balances.values()) {
    const fx = fxAt(state, cash.currency, asOf);
    cash.valueByn =
      Math.abs(cash.amount) < 1e-8 ? 0 : fx ? cash.amount * fx.rate : null;
    if (cash.valueByn === null)
      warnings.add(`Нет курса ${cash.currency} к BYN`);
    if (cash.amount && fx && daysBetween(fx.date, asOf) > 7)
      warnings.add(`${cash.currency}: курс от ${fx.date}`);
  }
  const pp = [...positions.values()];
  const cash = [...balances.values()];
  const complete =
    !pp.some((p) => p.valueByn === null) &&
    !pp.some((p) => p.accruedByn === null) &&
    !cash.some((c) => c.valueByn === null);
  const assetsByn = pp.reduce((s, p) => s + (p.valueByn ?? 0), 0);
  const cashByn = cash.reduce((s, p) => s + (p.valueByn ?? 0), 0);
  const accruedByn = pp.reduce((s, p) => s + (p.accruedByn ?? 0), 0);
  const totalByn = complete ? assetsByn + cashByn + accruedByn : null;
  const profitByn =
    totalByn === null ? null : totalByn + withdrawalsByn - depositsByn;
  const annualReturn =
    totalByn === null
      ? null
      : xirr([...flows, { date: asOf, amount: totalByn }]);
  return {
    positions: pp,
    cash,
    totalByn,
    assetsByn,
    cashByn,
    accruedByn: complete ? accruedByn : null,
    hasAutoAccrual: pp.some(
      (p) =>
        p.instrument.kind === "deposit" && p.instrument.autoAccrual !== false,
    ),
    depositsByn,
    withdrawalsByn,
    profitByn,
    feesByn,
    incomeByn: pp.reduce((s, p) => s + p.incomeByn, 0),
    realizedByn: pp.reduce((s, p) => s + p.realizedByn, 0),
    annualReturn,
    warnings: [...warnings],
  };
}
// XIRR is intentionally unavailable for ambiguous cash-flow patterns (multiple sign changes).
export function xirr(flows: { date: string; amount: number }[]): number | null {
  const byDate = new Map<string, number>();
  for (const f of flows)
    byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);
  const f = [...byDate]
    .map(([date, amount]) => ({ date, amount }))
    .filter((f) => Math.abs(f.amount) > 1e-8)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (
    f.length < 2 ||
    !f.some((f) => f.amount < 0) ||
    !f.some((f) => f.amount > 0) ||
    daysBetween(f[0].date, f.at(-1)!.date) < 1
  )
    return null;
  if (
    f.slice(1).filter((v, i) => Math.sign(v.amount) !== Math.sign(f[i].amount))
      .length !== 1
  )
    return null;
  const npv = (r: number) =>
    f.reduce(
      (sum, v) =>
        sum + v.amount / Math.pow(1 + r, daysBetween(f[0].date, v.date) / 365),
      0,
    );
  let lo = -0.9999,
    hi = 1;
  while (npv(lo) * npv(hi) > 0 && hi < 1e6) hi = hi * 2 + 1;
  if (!Number.isFinite(npv(lo)) || npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 160; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  const rate = (lo + hi) / 2;
  return Number.isFinite(rate) ? (Math.abs(rate) < 1e-12 ? 0 : rate) : null;
}
export function addMonths(date: string, months: number, anchorDay?: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = anchorDay ?? d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function paymentSchedule(
  i: Instrument,
  quantity: number,
  asOf = today(),
) {
  if (!i.maturity || i.maturity <= asOf || i.kind === "stock") return [];
  // Index-linked principal/coupons cannot be modeled by the fixed-rate schedule.
  if (i.research?.rateModel === "indexed" || i.research?.nominalKnown === false)
    return [];
  const face = i.kind === "deposit" ? quantity : quantity * i.nominal;
  const out: { date: string; amount: number; type: string }[] = [];
  if (!i.frequency || !i.nextPayment || i.research?.rateKnown === false) {
    out.push({
      date: i.maturity,
      amount: face,
      type: "Погашение номинала (без прогноза процентов)",
    });
    return out;
  }
  let date = i.nextPayment;
  let principal = face;
  const anchor = Number(date.slice(8));
  // Contractual regular coupons; actual issuer schedules may differ.
  for (
    let n = 0;
    date <= i.maturity && n < 1200;
    n++, date = addMonths(date, 12 / i.frequency, anchor)
  ) {
    if (date <= asOf) continue;
    const interest = (principal * i.annualRate) / 100 / i.frequency;
    if (i.kind === "deposit" && i.capitalization) principal += interest;
    else
      out.push({
        date,
        amount: interest,
        type: i.kind === "deposit" ? "Проценты (прогноз)" : "Купон (прогноз)",
      });
  }
  out.push({
    date: i.maturity,
    amount: principal,
    type: i.capitalization
      ? "Погашение с капитализацией (прогноз)"
      : "Погашение номинала",
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function depositProjection(
  principal: number,
  rate: number,
  days: number,
  capitalization = false,
) {
  if (!capitalization) return (((principal * rate) / 100) * days) / 365;
  return principal * (Math.pow(1 + rate / 100 / 12, days / (365 / 12)) - 1);
}
export function technicals(prices: number[]) {
  const sma = (n: number) =>
    prices.length >= n ? prices.slice(-n).reduce((s, v) => s + v, 0) / n : null;
  let rsi: number | null = null;
  if (prices.length >= 15) {
    const changes = prices
      .slice(-15)
      .slice(1)
      .map((p, n) => p - prices.slice(-15)[n]);
    const gains = changes.reduce((s, v) => s + Math.max(0, v), 0) / 14;
    const losses = changes.reduce((s, v) => s + Math.max(0, -v), 0) / 14;
    rsi =
      losses === 0
        ? gains === 0
          ? 50
          : 100
        : 100 - 100 / (1 + gains / losses);
  }
  return { sma20: sma(20), sma50: sma(50), rsi };
}
