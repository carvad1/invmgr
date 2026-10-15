import { daysBetween, portfolio } from "./finance";
import { shiftDate } from "./deposit";
import type { State } from "./types";

// Fixed sampling bounds work even for ledgers with thousands of operations.
// These are valuation snapshots, not every transaction or intraday movement.
export function historyDates(
  dates: string[],
  asOf: string,
  period: number,
): string[] {
  const first = dates.filter((d) => d <= asOf).sort()[0];
  if (!first) return [];
  const start = [first, shiftDate(asOf, -period)].sort().at(-1)!;
  const days = daysBetween(start, asOf);
  return [
    ...new Set(
      Array.from({ length: 25 }, (_, n) =>
        shiftDate(start, Math.round((days * n) / 24)),
      ),
    ),
  ];
}
export function portfolioHistory(state: State, asOf: string, period: number) {
  return historyDates(
    state.operations.map((o) => o.date),
    asOf,
    period,
  ).map((date) => {
    const p = portfolio(state, date);
    return {
      date,
      value: p.totalByn,
      invested: p.depositsByn - p.withdrawalsByn,
    };
  });
}
