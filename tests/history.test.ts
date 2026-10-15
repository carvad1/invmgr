import { describe, it, expect } from "vitest";
import { historyDates, portfolioHistory } from "../src/domain/history";
import { shiftDate } from "../src/domain/deposit";
import { operation, state } from "./helpers";
describe("история портфеля без блокировки интерфейса", () => {
  it("ограничивает снимки при тысячах операций, исключает будущие даты", () => {
    const dates = Array.from({ length: 5000 }, (_, n) =>
      shiftDate("2013-01-01", n),
    );
    const samples = historyDates(dates, "2026-09-26", 365);
    expect(samples).toHaveLength(25);
    expect(samples[0]).toBe("2025-09-26");
    expect(samples.at(-1)).toBe("2026-09-26");
    expect(samples.every((d) => d <= "2026-09-26")).toBe(true);
  });
  it("не повторяет даты в коротком периоде и не создаёт историю до первого вложения", () => {
    expect(historyDates(["2026-09-25"], "2026-09-26", 365)).toEqual([
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(historyDates(["2027-01-01"], "2026-09-26", 365)).toEqual([]);
  });
  it("сохраняет стоимость и чистые вложения на дату снимка", () => {
    const rows = portfolioHistory(
      state({
        operations: [
          operation({ date: "2026-09-01", amount: 1000 }),
          operation({ date: "2026-09-15", amount: 200, kind: "withdrawal" }),
        ],
      }),
      "2026-09-26",
      365,
    );
    expect(rows[0]).toEqual({
      date: "2026-09-01",
      value: 1000,
      invested: 1000,
    });
    expect(rows.at(-1)).toEqual({
      date: "2026-09-26",
      value: 800,
      invested: 800,
    });
  });
});
