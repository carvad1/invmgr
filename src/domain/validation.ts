import { z } from "zod";
import { currencies, kinds, today } from "./types";
const text = z.string().trim().max(5000);
const id = z.string().uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Некорректная дата",
  );
const optionalDate = z.union([z.literal(""), dateSchema]);
const positive = z.number().finite().positive().max(1e12);
const nonnegative = z.number().finite().min(0).max(1e12);
const currency = z.enum(currencies);
export const instrumentSchema = z
  .object({
    id,
    name: text.min(1, "Укажите название"),
    ticker: text.max(100),
    kind: z.enum(kinds),
    provider: text.min(1).max(100),
    currency,
    nominal: positive,
    annualRate: nonnegative.max(1000),
    maturity: optionalDate,
    frequency: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(12),
    ]),
    nextPayment: optionalDate,
    capitalization: z.boolean(),
    notes: text,
    sourceUrl: z.union([z.literal(""), z.url().max(2000)]),
    eps: z.number().finite().nullable(),
    bookValue: z.number().finite().nullable(),
    debt: nonnegative.nullable(),
    equity: z.number().finite().nullable(),
    revenue: nonnegative.nullable(),
    netIncome: z.number().finite().nullable(),
    reportDate: optionalDate,
  })
  .refine(
    (v) => !v.nextPayment || !v.maturity || v.nextPayment <= v.maturity,
    "Дата выплаты позже погашения",
  );
export const operationSchema = z
  .object({
    id,
    instrumentId: z.union([z.literal(""), id]),
    kind: z.enum(["deposit", "withdrawal", "buy", "sell", "income", "fee"]),
    provider: text.min(1).max(100),
    currency,
    date: dateSchema.refine(
      (v) => v <= today(),
      "Будущие операции не учитываются как совершённые",
    ),
    quantity: nonnegative,
    price: nonnegative,
    amount: nonnegative,
    fee: nonnegative,
    fx: positive,
    thesis: z.object({
      reason: text,
      goal: text,
      horizon: text,
      expectation: text,
      risks: text,
      exit: text,
    }),
    note: text,
    createdAt: z.string().datetime(),
    linkedId: id.optional(),
  })
  .superRefine((v, ctx) => {
    const trade = v.kind === "buy" || v.kind === "sell";
    if (trade && (!v.instrumentId || v.quantity <= 0 || v.price <= 0))
      ctx.addIssue({
        code: "custom",
        message: "Укажите инструмент, положительное количество и цену",
      });
    if (!trade && v.amount <= 0)
      ctx.addIssue({
        code: "custom",
        message: "Сумма должна быть больше нуля",
      });
    if (v.kind === "income" && !v.instrumentId)
      ctx.addIssue({
        code: "custom",
        message: "Выберите инструмент для выплаты дохода",
      });
    if (v.kind === "buy" && !v.thesis.reason.trim())
      ctx.addIssue({ code: "custom", message: "Запишите причину покупки" });
    if (v.currency === "BYN" && v.fx !== 1)
      ctx.addIssue({ code: "custom", message: "Курс BYN должен быть равен 1" });
    if (["deposit", "withdrawal", "fee"].includes(v.kind) && v.instrumentId)
      ctx.addIssue({
        code: "custom",
        message: "Денежная операция не привязывается к инструменту",
      });
  });
export const quoteSchema = z.object({
  id,
  instrumentId: id,
  date: dateSchema.refine(
    (v) => v <= today(),
    "Цена не может быть из будущего",
  ),
  price: positive,
  source: text.min(1),
});
export const fxSchema = z
  .object({
    currency,
    date: dateSchema.refine(
      (v) => v <= today(),
      "Курс не может быть из будущего",
    ),
    rate: positive,
    source: text.min(1),
  })
  .refine((v) => v.currency !== "BYN" || v.rate === 1, "Курс BYN равен 1");
export const settingsSchema = z.object({
  baseCurrency: currency,
  benchmarkRate: nonnegative.max(100),
});
