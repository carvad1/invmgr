import type { CatalogItem } from "./types";

export interface BondRow {
  id: string;
  name: string;
  issuer: string;
  currency: string;
  coupon: number | null;
  purchaseYield: number | null;
  historicalYield: number | null;
  offer: number | null;
  lastPrice: number | null;
  priceDate: string;
  maturity: string;
  rating: string;
  warning: string;
  indexed: boolean;
  source: "catalog" | "terminal";
  catalog?: CatalogItem;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// Price and yield must come from the same source. A historical yield is an
// indicative snapshot from Aigenis, not a new YTM calculation as of today.
export function bondAnalysis(row: BondRow) {
  if (row.offer !== null && row.offer > 0)
    return {
      price: row.offer,
      yield: row.purchaseYield,
      source: "offer" as const,
    };
  if (row.source === "terminal" && row.lastPrice !== null && row.lastPrice > 0)
    return {
      price: row.lastPrice,
      yield: row.historicalYield,
      source: "last" as const,
    };
  return { price: null, yield: null, source: null };
}

export function catalogBondRows(items: CatalogItem[]): BondRow[] {
  return items
    .filter((c) => c.kind === "bond")
    .map((c) => ({
      id: c.research?.issueId || c.id,
      name: c.name,
      issuer: c.research?.issuer || c.provider,
      currency: c.currency,
      coupon: c.rate,
      purchaseYield: null,
      historicalYield: null,
      offer: null,
      lastPrice: c.priceLabel.includes("Рыночная") ? c.price : null,
      priceDate: c.priceDate,
      maturity: c.maturity || c.research?.maturityText || "",
      rating:
        c.research?.rating?.kind === "credit"
          ? c.research.rating.value
          : "Без рейтинга",
      warning: "",
      indexed: c.research?.rateModel === "indexed",
      source: "catalog",
      catalog: c,
    }));
}

// Accept only JSON responses, never a copied request with Authorization or cookies.
export function parseTerminalBonds(raw: string): BondRow[] {
  if (raw.length > 2_000_000) throw new Error("Ответ слишком большой");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Вставьте JSON из вкладки Response, без HTTP-заголовков");
  }
  const root = obj(parsed);
  const entries = Array.isArray(root?.results) ? root.results : [parsed];
  const rows = new Map<string, BondRow>();
  for (const entry of entries) {
    const item = obj(entry);
    const definition = obj(item?.definition);
    if (!definition || definition.product !== "bond") continue;
    const id =
      str(definition.security_symbol) || str(definition.state_security_id);
    if (!id) continue;
    const issuer = obj(definition.issuer);
    const group = obj(issuer?.issuer_group_data);
    const rating = obj(definition.rating_level) || obj(issuer?.rating_level);
    const itemOffer = positive(item?.best_offer);
    const definitionOffer = positive(definition.best_offer);
    const offer = itemOffer ?? definitionOffer;
    const offerYield =
      itemOffer !== null
        ? (finite(item?.calc_yield_offer) ??
          (definitionOffer === itemOffer
            ? finite(definition.calc_yield_offer)
            : null))
        : definitionOffer !== null
          ? finite(definition.calc_yield_offer)
          : null;
    const historicalYield = finite(definition.calc_yield_last_deal);
    const indexed = str(definition.revenue_type) === "indexed";
    const next: BondRow = {
      id,
      name: str(item?.name_of_security) || str(definition.parent_symbol) || id,
      issuer: str(issuer?.full_name),
      currency: str(item?.settl_currency) || str(definition.currency),
      coupon: positive(definition.coupon_rate),
      purchaseYield: indexed ? null : offerYield,
      historicalYield,
      offer,
      lastPrice: positive(definition.last_deal_price),
      priceDate: str(item?.trading_status_updated_at).slice(0, 10),
      maturity: str(definition.maturity_date),
      rating: str(rating?.level_name) || "Без рейтинга",
      warning: str(group?.message),
      indexed,
      source: "terminal",
    };
    const current = rows.get(id);
    if (
      !current ||
      (!current.offer && offer) ||
      (current.offer === offer && str(item?.trading_session_id) === "NDA")
    )
      rows.set(id, next);
  }
  if (!rows.size) throw new Error("В ответе нет карточек облигаций Aigenis");
  return [...rows.values()];
}
