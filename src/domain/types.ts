export const currencies = ["BYN", "USD", "EUR", "RUB"] as const;
export type Currency = (typeof currencies)[number];
export const kinds = ["deposit", "token", "bond", "stock"] as const;
export type AssetKind = (typeof kinds)[number];
export const kindLabels: Record<AssetKind, string> = {
  deposit: "Депозит",
  token: "Токен",
  bond: "Облигация",
  stock: "Акция",
};
export const operationLabels = {
  deposit: "Пополнение",
  withdrawal: "Вывод",
  buy: "Покупка",
  sell: "Продажа / погашение",
  income: "Выплата дохода",
  fee: "Комиссия",
};
export type OperationKind = keyof typeof operationLabels;
export interface Thesis {
  reason: string;
  goal: string;
  horizon: string;
  expectation: string;
  risks: string;
  exit: string;
}
export interface Instrument {
  id: string;
  name: string;
  ticker: string;
  kind: AssetKind;
  provider: string;
  currency: Currency;
  nominal: number;
  annualRate: number;
  maturity: string;
  frequency: number;
  nextPayment: string;
  capitalization: boolean;
  notes: string;
  sourceUrl: string;
  eps: number | null;
  bookValue: number | null;
  debt: number | null;
  equity: number | null;
  revenue: number | null;
  netIncome: number | null;
  reportDate: string;
}
export interface Operation {
  id: string;
  instrumentId: string;
  kind: OperationKind;
  provider: string;
  currency: Currency;
  date: string;
  quantity: number;
  price: number;
  amount: number;
  fee: number;
  fx: number;
  thesis: Thesis;
  note: string;
  createdAt: string;
  linkedId?: string;
}
export interface Quote {
  id: string;
  instrumentId: string;
  date: string;
  price: number;
  source: string;
}
export interface FxRate {
  currency: Currency;
  date: string;
  rate: number;
  source: string;
}
export interface CatalogItem {
  id: string;
  provider: string;
  name: string;
  kind: AssetKind;
  currency: Currency;
  price: number | null;
  rate: number | null;
  termMonths: number | null;
  maturity: string;
  sourceUrl: string;
  fetchedAt: string;
  details: string;
  priceLabel: string;
  priceDate: string;
}
export interface SyncRun {
  provider: string;
  date: string;
  status: "ok" | "error";
  message: string;
}
export interface Settings {
  baseCurrency: Currency;
  benchmarkRate: number;
}
export interface State {
  instruments: Instrument[];
  operations: Operation[];
  quotes: Quote[];
  fxRates: FxRate[];
  catalog: CatalogItem[];
  syncRuns: SyncRun[];
  settings: Settings;
  dbPath: string;
}
export interface SaveOperation {
  operation: Operation;
  fundFromOutside: boolean;
}
export interface DesktopAPI {
  load: () => Promise<State>;
  saveInstrument: (value: Instrument) => Promise<State>;
  removeInstrument: (id: string) => Promise<State>;
  saveOperation: (value: SaveOperation) => Promise<State>;
  removeOperation: (id: string) => Promise<State>;
  saveQuote: (value: Quote) => Promise<State>;
  saveFx: (value: FxRate) => Promise<State>;
  saveSettings: (value: Settings) => Promise<State>;
  sync: () => Promise<State>;
  backup: () => Promise<string | null>;
  restore: () => Promise<State | null>;
  exportCsv: () => Promise<string | null>;
  openSource: (url: string) => Promise<void>;
}
export const emptyThesis = (): Thesis => ({
  reason: "",
  goal: "",
  horizon: "",
  expectation: "",
  risks: "",
  exit: "",
});
export const emptyInstrument = (): Instrument => ({
  id: crypto.randomUUID(),
  name: "",
  ticker: "",
  kind: "deposit",
  provider: "Банк",
  currency: "BYN",
  nominal: 1,
  annualRate: 0,
  maturity: "",
  frequency: 12,
  nextPayment: "",
  capitalization: false,
  notes: "",
  sourceUrl: "",
  eps: null,
  bookValue: null,
  debt: null,
  equity: null,
  revenue: null,
  netIncome: null,
  reportDate: "",
});
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
