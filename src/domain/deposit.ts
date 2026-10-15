import Decimal from "decimal.js";
import type { Instrument, Operation } from "./types";

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function yearDays(date: string) {
  const year = Number(date.slice(0, 4));
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}
export function depositRateAt(i: Instrument, date: string) {
  if (!i.depositRate) return i.annualRate;
  const rate = [...i.depositRate.history]
    .filter((r) => r.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return rate?.rate ?? i.annualRate;
}
function isPaymentDay(i: Instrument, date: string, first: string) {
  if (!i.frequency || 12 % i.frequency) return false;
  const anchor = i.nextPayment || first;
  const month = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
  const anchorMonth =
    Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7));
  const last = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
  ).getUTCDate();
  return (
    (month - anchorMonth) % (12 / i.frequency) === 0 &&
    Number(date.slice(8)) === Math.min(Number(anchor.slice(8)), last) &&
    date > first
  );
}

// Estimate only. No synthetic cash, income or trade records are persisted.
// Completed days [purchase, valuation) use the actual year length.
export function depositAccrual(
  i: Instrument,
  operations: Operation[],
  asOf: string,
) {
  const result = {
    earned: 0,
    unrecorded: 0,
    perDay: 0,
    warnings: [] as string[],
  };
  if (i.kind !== "deposit" || i.autoAccrual === false) return result;
  const ops = operations
    .filter((o) => o.instrumentId === i.id && o.date <= asOf)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    );
  const first = ops.find((o) => o.kind === "buy")?.date;
  if (!first || first > asOf) return result;
  const end = i.maturity && i.maturity < asOf ? i.maturity : asOf;
  if (end < first) return result;
  if ((Date.parse(end) - Date.parse(first)) / 86400000 > 36600) {
    result.warnings.push("Период вклада превышает 100 лет; проверьте даты.");
    return result;
  }
  if (i.depositRate) {
    if (!i.depositRate.history.some((r) => r.date <= first))
      result.warnings.push(
        "Нет полной истории ставки: для пропущенных дат использована сохранённая ставка.",
      );
    if (!i.depositRate.checkedOn || i.depositRate.checkedOn < end)
      result.warnings.push(
        `Ставка НБРБ проверена ${i.depositRate.checkedOn || "ещё не была"}; пока используется сохранённая история.`,
      );
  }
  if (
    ops.some((o) => o.kind === "sell" && (!i.maturity || o.date < i.maturity))
  )
    result.warnings.push(
      "Есть досрочное снятие: льготная ставка и перерасчёт банка не учтены; сверьте доход с выпиской.",
    );
  const byDate = new Map<string, Operation[]>();
  for (const o of ops) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
  let principal = new Decimal(0);
  let earned = new Decimal(0);
  let period = new Decimal(0);
  let capitalized = new Decimal(0);
  let recognized = new Decimal(0);
  const rateHistory = [...(i.depositRate?.history ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  for (let date = first; date <= end; date = shiftDate(date, 1)) {
    if (isPaymentDay(i, date, first) || date === i.maturity) {
      const paid = period.toDecimalPlaces(2);
      earned = earned.plus(paid);
      if (i.capitalization) capitalized = capitalized.plus(paid);
      period = new Decimal(0);
    }
    for (const o of byDate.get(date) ?? []) {
      if (o.kind === "buy") principal = principal.plus(o.quantity);
      if (o.kind === "sell") {
        principal = Decimal.max(0, principal.minus(o.quantity));
        if (principal.isZero()) capitalized = new Decimal(0);
      }
      if (o.kind === "income") recognized = recognized.plus(o.amount);
    }
    const virtualPrincipal = i.capitalization
      ? Decimal.max(0, capitalized.minus(recognized))
      : new Decimal(0);
    const daily = principal.gt(0)
      ? principal
          .plus(virtualPrincipal)
          .mul(rateHistory.find((r) => r.date <= date)?.rate ?? i.annualRate)
          .div(100)
          .div(yearDays(date))
      : new Decimal(0);
    if (date < end) period = period.plus(daily);
    else if (!i.maturity || date < i.maturity) result.perDay = daily.toNumber();
  }
  result.earned = earned.plus(period).toDecimalPlaces(2).toNumber();
  // Include payments confirmed after maturity too. Matching gross income avoids
  // counting the same interest twice; commissions remain in the cash ledger.
  const allRecognized = ops
    .filter((o) => o.kind === "income")
    .reduce((sum, o) => sum.plus(o.amount), new Decimal(0));
  result.unrecorded = Decimal.max(
    0,
    new Decimal(result.earned).minus(allRecognized),
  ).toNumber();
  return result;
}
