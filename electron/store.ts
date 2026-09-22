import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CatalogItem,
  FxRate,
  Instrument,
  Operation,
  Quote,
  SaveOperation,
  Settings,
  State,
  SyncRun,
} from "../src/domain/types";
import { emptyThesis, today } from "../src/domain/types";
import {
  fxSchema,
  instrumentSchema,
  operationSchema,
  quoteSchema,
  settingsSchema,
} from "../src/domain/validation";
import { operationValue, portfolio } from "../src/domain/finance";

export class Store {
  private db: DatabaseSync;
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = this.db.prepare("PRAGMA user_version").get()!.user_version;
    if (Number(version) > 1) {
      this.db.close();
      throw new Error("База создана более новой версией приложения");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instruments (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, instrument_id TEXT REFERENCES instruments(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, instrument_id TEXT NOT NULL REFERENCES instruments(id), date TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(instrument_id,date));
      CREATE TABLE IF NOT EXISTS fx_rates (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
  }
  private rows<T>(table: string, db = this.db): T[] {
    return db
      .prepare(`SELECT payload FROM ${table} ORDER BY rowid`)
      .all()
      .map((r) => JSON.parse(String(r.payload)));
  }
  private read(db = this.db): State {
    return {
      instruments: this.rows("instruments", db),
      operations: this.rows("operations", db),
      quotes: this.rows("quotes", db),
      fxRates: this.rows("fx_rates", db),
      catalog: this.rows("catalog", db),
      syncRuns: this.rows("sync_runs", db),
      settings: this.rows<Settings>("settings", db)[0] ?? {
        baseCurrency: "BYN",
        benchmarkRate: 10,
      },
      dbPath: this.path,
    };
  }
  load() {
    return this.read();
  }
  private atomic<T>(fn: () => T) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private put(table: string, id: string, value: unknown) {
    this.db
      .prepare(
        `INSERT INTO ${table}(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(id, JSON.stringify(value));
  }
  saveInstrument(input: Instrument) {
    const value = instrumentSchema.parse(input);
    const state = this.load();
    const old = state.instruments.find((i) => i.id === value.id);
    if (
      old &&
      state.operations.some((o) => o.instrumentId === old.id) &&
      (old.currency !== value.currency ||
        old.provider !== value.provider ||
        old.kind !== value.kind)
    )
      throw new Error(
        "У инструмента с операциями нельзя менять валюту, счёт и тип",
      );
    this.put("instruments", value.id, value);
    return this.load();
  }
  removeInstrument(id: string) {
    z.string().uuid().parse(id);
    if (this.load().operations.some((o) => o.instrumentId === id))
      throw new Error("Сначала удалите операции этого инструмента");
    this.atomic(() => {
      this.db.prepare("DELETE FROM quotes WHERE instrument_id=?").run(id);
      this.db.prepare("DELETE FROM instruments WHERE id=?").run(id);
    });
    return this.load();
  }
  private putOperation(o: Operation) {
    this.db
      .prepare(
        "INSERT INTO operations(id,instrument_id,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET instrument_id=excluded.instrument_id,payload=excluded.payload",
      )
      .run(o.id, o.instrumentId || null, JSON.stringify(o));
  }
  saveOperation(input: SaveOperation) {
    const validated = z
      .object({ operation: operationSchema, fundFromOutside: z.boolean() })
      .parse(input);
    const o = validated.operation;
    const state = this.load();
    const existing = state.operations.find((t) => t.id === o.id);
    if (existing?.linkedId)
      throw new Error("Автопополнение меняется вместе с покупкой");
    delete o.linkedId;
    const lastTimestamp = state.operations.reduce(
      (max, item) => Math.max(max, Date.parse(item.createdAt)),
      0,
    );
    o.createdAt =
      existing?.createdAt ??
      new Date(Math.max(Date.now(), lastTimestamp + 1)).toISOString();
    const instrument = state.instruments.find((i) => i.id === o.instrumentId);
    if (
      instrument?.kind === "deposit" &&
      ["buy", "sell"].includes(o.kind) &&
      o.price !== 1
    )
      throw new Error(
        "Для депозита количество — сумма вклада, цена единицы равна 1",
      );
    const ops = state.operations.filter(
      (t) => t.id !== o.id && t.linkedId !== o.id,
    );
    if (validated.fundFromOutside && o.kind === "buy") {
      const funding: Operation = {
        ...o,
        id: randomUUID(),
        instrumentId: "",
        kind: "deposit",
        quantity: 0,
        price: 0,
        amount: operationValue(o) + o.fee,
        fee: 0,
        thesis: emptyThesis(),
        note: `Внесение извне для покупки: ${instrument?.name ?? ""}`,
        linkedId: o.id,
      };
      ops.push(funding);
    }
    ops.push(o);
    portfolio({ ...state, operations: ops }, today(), true);
    this.atomic(() => {
      for (const t of state.operations.filter((t) => t.linkedId === o.id))
        this.db.prepare("DELETE FROM operations WHERE id=?").run(t.id);
      for (const t of ops.filter((t) => t.id === o.id || t.linkedId === o.id))
        this.putOperation(t);
      // The actual transaction exchange rate is not a market quote; store it only if the day lacks one.
      if (
        o.currency !== "BYN" &&
        !state.fxRates.some(
          (r) => r.currency === o.currency && r.date === o.date,
        )
      )
        this.put("fx_rates", `${o.currency}:${o.date}`, {
          currency: o.currency,
          date: o.date,
          rate: o.fx,
          source: "Курс введённой операции",
        });
    });
    return this.load();
  }
  removeOperation(id: string) {
    z.string().uuid().parse(id);
    const state = this.load();
    if (state.operations.find((o) => o.id === id)?.linkedId)
      throw new Error(
        "Удалите связанную покупку: её автопополнение будет удалено вместе с ней",
      );
    const removed = state.operations.filter(
      (o) => o.id === id || o.linkedId === id,
    );
    portfolio(
      {
        ...state,
        operations: state.operations.filter((o) => !removed.includes(o)),
      },
      today(),
      true,
    );
    this.atomic(() => {
      for (const o of removed)
        this.db.prepare("DELETE FROM operations WHERE id=?").run(o.id);
    });
    return this.load();
  }
  saveQuote(input: Quote) {
    const value = quoteSchema.parse(input);
    if (!this.load().instruments.some((i) => i.id === value.instrumentId))
      throw new Error("Инструмент не найден");
    this.db
      .prepare(
        "INSERT INTO quotes(id,instrument_id,date,payload) VALUES (?,?,?,?) ON CONFLICT(instrument_id,date) DO UPDATE SET payload=excluded.payload",
      )
      .run(value.id, value.instrumentId, value.date, JSON.stringify(value));
    return this.load();
  }
  saveFx(input: FxRate) {
    const value = fxSchema.parse(input);
    this.put("fx_rates", `${value.currency}:${value.date}`, value);
    return this.load();
  }
  saveSettings(input: Settings) {
    const value = settingsSchema.parse(input);
    this.put("settings", "main", value);
    return this.load();
  }
  saveCatalog(provider: string, values: CatalogItem[]) {
    if (!values.length)
      throw new Error("Не найдены инструменты. Предыдущий каталог сохранён.");
    this.atomic(() => {
      for (const old of this.load().catalog.filter(
        (c) => c.provider === provider,
      ))
        this.db.prepare("DELETE FROM catalog WHERE id=?").run(old.id);
      for (const value of values) this.put("catalog", value.id, value);
    });
  }
  log(run: SyncRun) {
    this.put("sync_runs", run.provider, run);
  }
  async backup(path: string) {
    await backup(this.db, path);
  }
  async restore(path: string) {
    if (statSync(path).size > 100 * 1024 * 1024)
      throw new Error("Файл базы больше 100 МБ");
    const source = new DatabaseSync(path, { readOnly: true });
    let state: State;
    try {
      if (
        source.prepare("PRAGMA integrity_check").get()!.integrity_check !==
          "ok" ||
        Number(source.prepare("PRAGMA user_version").get()!.user_version) !== 1
      )
        throw new Error("Файл повреждён или версия базы не поддерживается");
      if (source.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Нарушены связи в базе");
      state = this.read(source);
      state.instruments.forEach((i) => instrumentSchema.parse(i));
      state.operations.forEach((o) => operationSchema.parse(o));
      state.quotes.forEach((q) => quoteSchema.parse(q));
      state.fxRates.forEach((f) => fxSchema.parse(f));
      settingsSchema.parse(state.settings);
      z.array(
        z.object({
          id: z.string(),
          provider: z.string(),
          name: z.string(),
          currency: z.enum(["BYN", "USD", "EUR", "RUB"]),
          kind: z.enum(["deposit", "token", "bond", "stock"]),
          price: z.number().nullable(),
          rate: z.number().nullable(),
          termMonths: z.number().nullable(),
          maturity: z.string(),
          sourceUrl: z.string(),
          fetchedAt: z.string(),
          details: z.string(),
          priceLabel: z.string(),
          priceDate: z.string(),
        }),
      ).parse(state.catalog);
      z.array(
        z.object({
          provider: z.string(),
          date: z.string(),
          status: z.enum(["ok", "error"]),
          message: z.string(),
        }),
      ).parse(state.syncRuns);
      portfolio(state, today(), true);
    } finally {
      source.close();
    }
    const safetyPath = `${this.path}.${Date.now()}.backup`;
    await this.backup(safetyPath);
    this.atomic(() => {
      for (const table of [
        "operations",
        "quotes",
        "instruments",
        "fx_rates",
        "catalog",
        "sync_runs",
        "settings",
      ])
        this.db.exec(`DELETE FROM ${table}`);
      for (const i of state.instruments) this.put("instruments", i.id, i);
      for (const o of state.operations) this.putOperation(o);
      for (const q of state.quotes)
        this.db
          .prepare(
            "INSERT INTO quotes(id,instrument_id,date,payload) VALUES (?,?,?,?)",
          )
          .run(q.id, q.instrumentId, q.date, JSON.stringify(q));
      for (const f of state.fxRates)
        this.put("fx_rates", `${f.currency}:${f.date}`, f);
      for (const c of state.catalog) this.put("catalog", c.id, c);
      for (const r of state.syncRuns) this.put("sync_runs", r.provider, r);
      this.put("settings", "main", state.settings);
    });
    return this.load();
  }
  close() {
    this.db.close();
  }
}
