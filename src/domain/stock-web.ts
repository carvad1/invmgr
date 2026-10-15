import { z } from "zod";
import type { Instrument } from "./types";

const url = z.string().url().max(2000);
export const stockWebSchema = z.object({
  checkedAt: z.string().datetime(),
  status: z.enum(["ok", "partial", "error", "unresolved"]),
  identity: z
    .object({
      unp: z.string().regex(/^\d{9}$/),
      id: z.number().int().positive(),
      name: z.string().max(1000),
    })
    .nullable(),
  sources: z
    .array(
      z.object({
        name: z.string().max(200),
        url,
        checkedAt: z.string().datetime(),
        ok: z.boolean(),
        message: z.string().max(500),
      }),
    )
    .max(12),
  documents: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(1500),
        url,
        uploadedAt: z.string().max(30),
        reportingDate: z.string().max(30),
        kind: z.enum(["report", "dividend", "event", "other"]),
        state: z.enum(["unread", "text", "scan", "unsupported", "error"]),
        pages: z
          .array(
            z.object({
              page: z.number().int().positive(),
              text: z.string().max(12000),
              ocrConfidence: z.number().min(0).max(100).optional(),
            }),
          )
          .max(12),
        ocr: z.boolean().optional(),
        pageCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
      }),
    )
    .max(80),
  dividends: z
    .array(
      z.object({
        earningsYear: z.number().int().min(2016).max(2200),
        paymentYear: z.number().int().min(2017).max(2200),
        amount: z.number().finite().min(0).max(1e6),
        currency: z.literal("BYN"),
        shareClass: z.string().max(200),
        source: url,
        basis: z.enum(["reported", "announced"]).optional(),
      }),
    )
    .max(50),
  announcements: z
    .array(
      z.object({
        amount: z.number().finite().min(0).max(1e6),
        currency: z.literal("BYN"),
        shareClass: z.string().max(200),
        earningsYear: z.number().int().min(2016).max(2200).nullable(),
        source: url,
        quote: z.string().max(1500),
        publishedAt: z.string().max(30),
      }),
    )
    .max(20)
    .optional(),
  shareInfo: z
    .object({
      shareClass: z.string().max(200),
      shares: z.number().int().positive(),
      asOf: z.string().max(30),
      source: url,
    })
    .nullable(),
  issues: z.array(z.string().max(1000)).max(15),
});
export type StockWeb = z.infer<typeof stockWebSchema>;
export type StockDocument = StockWeb["documents"][number];
export const WEB_REFRESH_MS = 24 * 60 * 60 * 1000;
export function stockWebDue(i: Instrument, now = Date.now()) {
  const w = i.stockAnalysis?.web;
  const ttl =
    w?.status === "error" || w?.status === "partial"
      ? 30 * 60 * 1000
      : WEB_REFRESH_MS;
  return (
    !w ||
    !Number.isFinite(Date.parse(w.checkedAt)) ||
    now - Date.parse(w.checkedAt) >= ttl
  );
}
export function stockIssuerUnp(i: Instrument): string {
  const explicit = i.stockAnalysis?.issuerUnp;
  if (explicit) return explicit;
  const unp = i.stockAnalysis?.market?.details.find(
    (d) => d.label === "УНП эмитента",
  )?.value;
  if (unp && /^\d{9}$/.test(unp)) return unp;
  // Legacy local entries predate the terminal import. Only these exact issuer names are mapped.
  const name = `${i.name} ${i.stockAnalysis?.market?.issuer ?? ""}`;
  if (/(?:^|\s|[«"])(?:асб\s+)?беларусбанк(?=\s|[»"]|$)/i.test(name))
    return "100325912";
  if (/(?:^|\s|[«"])приорбанк(?=\s|[»"]|$)/i.test(name)) return "100220190";
  return "";
}
export function latestWebDividend(i: Instrument) {
  return (
    i.stockAnalysis?.web?.dividends
      .filter(
        (d) =>
          d.currency === i.currency &&
          d.paymentYear <= new Date().getFullYear(),
      )
      .sort(
        (a, b) =>
          b.earningsYear - a.earningsYear || b.paymentYear - a.paymentYear,
      )[0] ?? null
  );
}
export function stockWebIdentity(i: Instrument) {
  return JSON.stringify([
    i.id,
    stockIssuerUnp(i),
    i.name,
    i.ticker,
    i.currency,
    ...(i.stockAnalysis?.market?.details ?? [])
      .filter((d) => ["ISIN", "Госрегистрация", "CFI"].includes(d.label))
      .map((d) => `${d.label}:${d.value}`)
      .sort(),
  ]);
}
export function webDividendYield(i: Instrument, price: number | null) {
  const d = latestWebDividend(i);
  return d && price !== null && price > 0 ? d.amount / price : null;
}
export function isBankStock(i: Instrument) {
  return /банк/i.test(
    `${i.name} ${i.stockAnalysis?.market?.issuer ?? ""} ${i.stockAnalysis?.sector ?? ""}`,
  );
}
