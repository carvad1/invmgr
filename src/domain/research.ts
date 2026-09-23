import {
  emptyInstrument,
  today,
  type CatalogItem,
  type Instrument,
  type Research,
} from "./types";
import { daysBetween } from "./finance";

export function blankResearch(
  issueId: string,
  issuer: string,
  fetchedAt = new Date().toISOString(),
): Research {
  return {
    issueId,
    issuer,
    fetchedAt,
    rateKnown: false,
    nominalKnown: false,
    rateModel: "unknown",
    documents: [],
    paymentDates: [],
    maturityText: "",
    security: "",
    caveats: [],
    paymentStatus: "unknown",
    statusDate: "",
    statusSource: "",
  };
}

export function catalogInstrument(c: CatalogItem): Instrument {
  return {
    ...emptyInstrument(),
    name: c.name,
    ticker: c.research?.issueId ?? "",
    kind: c.kind,
    provider: c.provider,
    currency: c.currency,
    nominal:
      c.nominal ??
      (c.provider === "Finstore" || c.priceLabel.includes("Номинал")
        ? c.price
        : null) ??
      1,
    annualRate: c.rate ?? 0,
    maturity: c.maturity,
    frequency: c.frequency ?? 0,
    nextPayment: c.research?.paymentDates.find((d) => d > today()) ?? "",
    sourceUrl: c.sourceUrl,
    notes: c.details,
    research: c.research ?? {
      ...blankResearch(c.id, c.name, c.fetchedAt),
      rateKnown: c.rate !== null,
      nominalKnown: c.nominal != null || c.priceLabel.includes("Номинал"),
      caveats: [
        "Условия взяты из краткой карточки. Откройте страницу выпуска для уточнения.",
      ],
    },
  };
}

// An explainable screening checklist, not a credit model or a probability of repayment.
export function assessDebt(i: Instrument, asOf = today()) {
  const r = i.research;
  const reportFresh =
    !!i.reportDate &&
    i.reportDate <= asOf &&
    daysBetween(i.reportDate, asOf) <= 550;
  const statusFresh =
    !!r?.statusDate &&
    r.statusDate <= asOf &&
    daysBetween(r.statusDate, asOf) <= 90 &&
    !!r.statusSource;
  const leverage =
    i.debt !== null && i.equity !== null && i.equity > 0
      ? i.debt / i.equity
      : null;
  const problems: string[] = [];
  const missing: string[] = [];
  if (r?.paymentStatus === "late")
    problems.push(
      `Отмечена просрочка${r.statusDate ? ` на ${r.statusDate}` : ""}; проверьте, погашена ли она.`,
    );
  if (i.equity !== null && i.equity <= 0)
    problems.push("Собственный капитал неположительный.");
  if (i.netIncome !== null && i.netIncome < 0)
    problems.push("Введённая отчётность показывает чистый убыток.");
  if (leverage !== null && leverage > 3)
    problems.push(
      "Долг превышает капитал более чем в 3 раза: нужна оценка отрасли и структуры долга.",
    );
  if (i.maturity && i.maturity <= asOf)
    problems.push(
      "Дата погашения уже наступила. Проверьте фактическое исполнение.",
    );
  if (!reportFresh) missing.push("свежая отчётность (не старше 18 месяцев)");
  if (i.equity === null || i.debt === null || i.netIncome === null)
    missing.push("долг, капитал и чистая прибыль");
  if (!statusFresh || !r || r.paymentStatus === "unknown")
    missing.push("проверка выплат с датой и источником (до 90 дней)");
  if (!r?.security)
    missing.push("обеспечение или явное указание его отсутствия");
  if (!i.maturity) missing.push("точная дата погашения");
  if (r && (!r.rateKnown || !r.nominalKnown)) missing.push("ставка и номинал");
  const severe =
    r?.paymentStatus === "late" || (i.equity !== null && i.equity <= 0);
  const tone = severe
    ? "danger"
    : problems.length
      ? "warning"
      : missing.length
        ? "unknown"
        : "checked";
  const label = severe
    ? "Высокий риск по данным"
    : problems.length
      ? "Есть факторы риска"
      : missing.length
        ? "Недостаточно данных"
        : "Базовая проверка пройдена";
  return { label, tone, problems, missing, leverage, reportFresh, statusFresh };
}

export function debtScenario(
  i: Instrument,
  budget: number,
  price: number,
  fee: number,
  days: number,
  asOf = today(),
) {
  const quantity =
    price > 0 && budget > fee ? Math.floor((budget - fee) / price) : 0;
  const invested = quantity * price + (quantity > 0 ? fee : 0);
  const horizon = i.maturity
    ? Math.max(0, Math.min(days, daysBetween(asOf, i.maturity)))
    : days;
  const blocked =
    i.research?.rateModel === "indexed" ||
    i.research?.rateKnown === false ||
    i.research?.nominalKnown === false;
  const couponYear =
    !blocked && quantity > 0
      ? (quantity * i.nominal * i.annualRate) / 100
      : null;
  const interest =
    couponYear === null || horizon <= 0
      ? null
      : (couponYear * horizon) / 365 - fee;
  return {
    quantity,
    invested,
    unspent: budget - invested,
    horizon,
    interest,
    returnPercent:
      interest !== null && invested > 0 ? (interest / invested) * 100 : null,
    currentYield:
      !blocked && price > 0 ? (i.nominal * i.annualRate) / price : null,
  };
}
