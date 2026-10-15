import { z } from "zod";
import { currencies, today } from "./types";
import { stockWebSchema } from "./stock-web";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= today(),
    "Нужна существующая дата, не позже сегодняшней",
  );
const optionalDate = z.union([z.literal(""), date]);
const amount = z.number().finite().min(-1e15).max(1e15).nullable();
const nonnegative = z.number().finite().min(0).max(1e15).nullable();
const price = z.number().finite().positive().max(1e12).nullable();
export const stockTradeSchema = z.object({
  id: z.string().max(100),
  securityId: z.string().max(100),
  date,
  price: z.number().finite().positive().max(1e12),
  min: price,
  max: price,
  count: nonnegative,
  volume: nonnegative,
});
export const stockTerminalSchema = z.object({
  statsImportedAt: z.string().datetime().optional(),
  definitionId: z.string().max(100),
  importedAt: z.string().datetime(),
  trades: z.array(stockTradeSchema).max(5000),
  historyComplete: z.boolean(),
  stats: z.record(z.string().max(80), z.number().finite().min(0).max(1e15)),
  details: z
    .array(
      z.object({
        block: z.string().max(200),
        label: z.string().max(200),
        value: z.string().max(2000),
      }),
    )
    .max(100),
});
export const stockReportSchema = z.object({
  date,
  currency: z.enum(currencies),
  source: z.string().trim().min(1).max(2000),
  revenue: nonnegative,
  netIncome: amount,
  equity: amount,
  debt: nonnegative,
  cash: nonnegative,
  ebitda: amount,
  operatingCashFlow: amount,
  capex: nonnegative,
  shares: z.number().finite().positive().max(1e15).nullable(),
  eps: amount,
  bookValue: amount,
  dividend: nonnegative,
});
export const valuationSchema = z
  .object({
    model: z.enum(["fcfe", "dividend"]),
    cashFlow: price,
    growth: z.number().finite().min(-90).max(100),
    discount: z.number().finite().min(0.1).max(100),
    terminalGrowth: z.number().finite().min(-20).max(20),
    years: z.number().int().min(1).max(10),
    margin: z.number().finite().min(0).max(90),
    source: z.string().trim().max(2000),
  })
  .refine(
    (v) => v.discount > v.terminalGrowth,
    "Требуемая доходность должна быть выше долгосрочного роста",
  );
export const stockAnalysisSchema = z.object({
  issuerUnp: z
    .string()
    .regex(/^(\d{9})?$/)
    .optional(),
  web: stockWebSchema.optional(),
  market: z
    .object({
      key: z.string().min(1).max(200),
      definitionId: z.string().max(100),
      securityIds: z.array(z.string().max(100)).max(100).optional(),
      issuer: z.string().max(1000),
      ticker: z.string().max(100),
      exchange: z.string().max(100),
      session: z.string().max(100),
      currency: z.enum(currencies),
      ask: price,
      bid: price,
      last: price,
      lastDate: optionalDate,
      capturedAt: z.string().datetime(),
      warning: z.string().max(5000),
      rating: z.string().max(300),
      lot: z.number().finite().positive().nullable(),
      details: z
        .array(
          z.object({ label: z.string().max(100), value: z.string().max(1000) }),
        )
        .max(20)
        .default([]),
    })
    .nullable(),
  description: z.string().max(5000),
  sector: z.string().max(200),
  reports: z
    .array(stockReportSchema)
    .max(20)
    .refine(
      (v) => new Set(v.map((r) => r.date)).size === v.length,
      "Отчёты с одинаковой датой",
    ),
  valuation: valuationSchema,
  history: z
    .array(z.object({ date, close: z.number().finite().positive().max(1e12) }))
    .max(5000)
    .refine(
      (v) => new Set(v.map((p) => p.date)).size === v.length,
      "Повторяющиеся даты котировок",
    ),
  historySource: z.string().max(2000),
  adjusted: z.boolean(),
  terminal: stockTerminalSchema.optional(),
});
export type StockTrade = z.infer<typeof stockTradeSchema>;
export type StockTerminal = z.infer<typeof stockTerminalSchema>;
export type StockReport = z.infer<typeof stockReportSchema>;
export type StockAnalysis = z.infer<typeof stockAnalysisSchema>;
export type StockMarket = NonNullable<StockAnalysis["market"]>;
export type StockValuation = StockAnalysis["valuation"];
export const emptyStockAnalysis = (): StockAnalysis => ({
  market: null,
  description: "",
  sector: "",
  reports: [],
  valuation: {
    model: "fcfe",
    cashFlow: null,
    growth: 5,
    discount: 20,
    terminalGrowth: 3,
    years: 5,
    margin: 25,
    source: "",
  },
  history: [],
  historySource: "",
  adjusted: false,
});
