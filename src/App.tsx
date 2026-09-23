import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  currencies,
  emptyInstrument,
  kindLabels,
  kinds,
  operationLabels,
  today,
  type CatalogItem,
  type Instrument,
  type Operation,
  type State,
} from "./domain/types";
import {
  daysBetween,
  fxAt,
  operationValue,
  paymentSchedule,
  portfolio,
  sortOperations,
} from "./domain/finance";
import {
  Banner,
  dateLabel,
  Empty,
  Metric,
  Modal,
  money,
  num,
} from "./components/ui";
import {
  FxForm,
  InstrumentForm,
  OperationForm,
  QuoteForm,
} from "./components/forms";
import Analysis from "./components/Analysis";
import { depositRateAt } from "./domain/deposit";
import { catalogInstrument } from "./domain/research";
import { ResearchImport } from "./components/QuickResearch";

const pages = [
  {
    id: "overview",
    label: "Обзор",
    icon: LayoutDashboard,
    subtitle: "Вся картина ваших инвестиций",
  },
  {
    id: "assets",
    label: "Мои активы",
    icon: Wallet,
    subtitle: "Позиции, условия и инвестиционные идеи",
  },
  {
    id: "analysis",
    label: "Анализ",
    icon: Activity,
    subtitle: "Разберитесь в инструменте перед покупкой",
  },
  {
    id: "journal",
    label: "Операции",
    icon: BookOpen,
    subtitle: "История движения денег и ваших решений",
  },
  {
    id: "calendar",
    label: "Календарь выплат",
    icon: CalendarDays,
    subtitle: "Планируйте поступления и погашения",
  },
  {
    id: "sources",
    label: "Каталог и источники",
    icon: Globe2,
    subtitle: "Открытые данные Finstore, Aigenis и НБРБ",
  },
  {
    id: "settings",
    label: "Настройки",
    icon: Settings2,
    subtitle: "Валюта, резервные копии и ваши данные",
  },
] as const;
type Page = (typeof pages)[number]["id"];
type Dialog =
  | { type: "instrument"; value: Instrument }
  | { type: "operation"; instrumentId?: string; operation?: Operation }
  | { type: "quote"; value: Instrument }
  | { type: "fx" }
  | {
      type: "confirm";
      title: string;
      text: string;
      action: () => Promise<void>;
    }
  | null;
const palette = ["#178979", "#7e9fe2", "#b9a1d8", "#e5b46d", "#c4cbd5"];

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [period, setPeriod] = useState(365);
  const [asOf, setAsOf] = useState(today());
  useEffect(() => {
    if (!window.invest) {
      setFatal(
        "Откройте приложение через Invest Manager.exe или npm start. База доступна только в desktop-приложении.",
      );
      return;
    }
    window.invest
      .load()
      .then(setState)
      .catch((e) => setFatal(e.message));
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setAsOf(today()), 60000);
    const refresh = setInterval(() => {
      window.invest
        ?.load()
        .then(setState)
        .catch(() => {});
    }, 15 * 60000);
    const onFocus = () => setAsOf(today());
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  const p = useMemo(
    () => (state ? portfolio(state, asOf) : null),
    [state, asOf],
  );
  const history = useMemo(() => {
    if (!state?.operations.length) return [];
    const first = sortOperations(state.operations)[0].date;
    const end = asOf;
    const begin = new Date(`${end}T00:00:00Z`);
    begin.setUTCDate(begin.getUTCDate() - period);
    const start =
      first > begin.toISOString().slice(0, 10)
        ? first
        : begin.toISOString().slice(0, 10);
    const days = daysBetween(start, end);
    const dates = new Set([
      start,
      end,
      ...state.operations.filter((o) => o.date >= start).map((o) => o.date),
    ]);
    for (let n = 1; n < 24; n++) {
      const d = new Date(`${start}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Math.round((days * n) / 24));
      dates.add(d.toISOString().slice(0, 10));
    }
    return [...dates].sort().map((date) => {
      const result = portfolio(state, date);
      return {
        date,
        value: result.totalByn,
        invested: result.depositsByn - result.withdrawalsByn,
      };
    });
  }, [state, period, asOf]);
  if (fatal)
    return (
      <div className="fatal">
        <Database size={40} />
        <h1>Не удалось открыть базу</h1>
        <p>{fatal}</p>
      </div>
    );
  if (!state || !p)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <span>Открываем ваш портфель…</span>
      </div>
    );
  const current = pages.find((p) => p.id === page)!;
  const base = state.settings.baseCurrency;
  const rate = fxAt(state, base, today())?.rate;
  const display = (v: number | null) =>
    money(v === null || !rate ? null : v / rate, base);
  const active = p.positions.filter((p) => p.quantity > 0);
  const go = (p: Page) => {
    setPage(p);
    setSearch("");
    setFilter("all");
  };
  const notifyError = (e: unknown) =>
    setToast({ text: e instanceof Error ? e.message : String(e), error: true });
  const act = async (fn: () => Promise<State>, message: string) => {
    try {
      setState(await fn());
      setToast({ text: message });
    } catch (e) {
      notifyError(e);
    }
  };
  const add = (kind: Instrument["kind"] = "deposit") =>
    setDialog({
      type: "instrument",
      value: {
        ...emptyInstrument(),
        kind,
        provider:
          kind === "token"
            ? "Finstore"
            : kind === "deposit"
              ? "Банк"
              : "Aigenis",
        nominal: kind === "deposit" ? 1 : 100,
      },
    });
  const sync = async () => {
    setSyncing(true);
    try {
      const result = await window.invest.sync();
      setState(result);
      const failed = result.syncRuns.filter((s) => s.status === "error");
      setToast({
        text: failed.length
          ? `Не обновились: ${failed.map((s) => s.provider).join(", ")}. Подробности в источниках.`
          : "Каталог и курсы обновлены",
        error: !!failed.length,
      });
    } catch (e) {
      notifyError(e);
    } finally {
      setSyncing(false);
    }
  };
  const source = (url: string) => {
    window.invest.openSource(url).catch(notifyError);
  };
  const addCatalog = (c: CatalogItem) =>
    setDialog({
      type: "instrument",
      value: catalogInstrument(c),
    });
  const analyzeCatalog = async (c: CatalogItem) => {
    const old = state.instruments.find(
      (i) =>
        i.provider === c.provider &&
        (i.research?.issueId && c.research?.issueId
          ? i.research.issueId === c.research.issueId
          : i.sourceUrl === c.sourceUrl &&
            i.name === c.name &&
            i.currency === c.currency),
    );
    if (old) {
      setSelected(old.id);
      go("analysis");
      setToast({
        text: "Открыт сохранённый анализ. Условия можно изменить в карточке.",
      });
      return;
    }
    setAnalyzing(true);
    try {
      let item = c;
      if (c.provider === "Finstore" && !c.maturity) {
        const fresh = await window.invest.inspectSource(c.sourceUrl);
        item =
          fresh.find(
            (f) => f.sourceUrl === c.sourceUrl && f.currency === c.currency,
          ) ?? c;
      }
      const value = catalogInstrument(item);
      setState(await window.invest.saveInstrument(value));
      setSelected(value.id);
      go("analysis");
      setToast({ text: "Анализ сохранён. Покупка не записывалась." });
    } finally {
      setAnalyzing(false);
    }
  };
  const payments = active
    .flatMap((pos) =>
      paymentSchedule(pos.instrument, pos.quantity).map((x) => ({
        ...x,
        instrument: pos.instrument,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const allocations = kinds
    .map((kind, n) => ({
      name: kindLabels[kind],
      value: p.positions
        .filter((p) => p.instrument.kind === kind)
        .reduce((s, p) => s + (p.valueByn ?? 0) + (p.accruedByn ?? 0), 0),
      color: palette[n],
    }))
    .concat([{ name: "Деньги", value: p.cashByn, color: palette[4] }])
    .filter((v) => v.value > 0);
  const assetRows = p.positions.filter(
    (pos) =>
      (filter === "all" || pos.instrument.kind === filter) &&
      `${pos.instrument.name} ${pos.instrument.provider} ${pos.instrument.ticker}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const newButton = (
    <button className="button primary" onClick={() => add()}>
      <Plus size={17} />
      Добавить актив
    </button>
  );
  const latestOperations = sortOperations(state.operations).reverse();
  function operationTable(ops: Operation[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Операция / инструмент</th>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Комиссия</th>
              <th>Причина / комментарий</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => {
              const i = state!.instruments.find((i) => i.id === o.instrumentId);
              return (
                <tr key={o.id}>
                  <td>
                    <div className="row-title">{operationLabels[o.kind]}</div>
                    <small>
                      {i?.name ?? o.provider}
                      {o.linkedId ? " · автопополнение" : ""}
                    </small>
                  </td>
                  <td className="nowrap">{dateLabel(o.date)}</td>
                  <td className="numeric">
                    {money(operationValue(o), o.currency)}
                  </td>
                  <td className="numeric">{money(o.fee, o.currency)}</td>
                  <td>
                    <div
                      className="reason-cell"
                      title={o.thesis.reason || o.note}
                    >
                      {o.thesis.reason || o.note || "—"}
                    </div>
                  </td>
                  <td>
                    {!o.linkedId && (
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          title="Изменить операцию"
                          aria-label="Изменить операцию"
                          onClick={() =>
                            setDialog({ type: "operation", operation: o })
                          }
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button danger"
                          title="Удалить операцию"
                          aria-label="Удалить операцию"
                          onClick={() =>
                            setDialog({
                              type: "confirm",
                              title: "Удалить операцию?",
                              text: "Связанное автопополнение будет удалено вместе с покупкой. Приложение проверит остатки после удаления.",
                              action: async () => {
                                setState(
                                  await window.invest.removeOperation(o.id),
                                );
                                setDialog(null);
                              },
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <div className="brand-mark">
            <TrendingUp size={23} />
          </div>
          <span>
            invest<span className="brand-light">manager</span>
            <small>ЛИЧНЫЙ КАПИТАЛ</small>
          </span>
        </a>
        <div className="workspace-label">МОЙ ПОРТФЕЛЬ</div>
        <nav>
          {pages.slice(0, 6).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "assets" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="note-symbol">
            <ShieldCheck size={20} />
          </div>
          <strong>Под вашим контролем</strong>
          <p>Данные хранятся на этом компьютере.</p>
          <button onClick={() => go("settings")}>
            Управление данными
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={19} />
            Настройки
          </button>
          <div className="profile">
            <div className="avatar">Я</div>
            <div>
              <strong>Личный портфель</strong>
              <span>Беларусь · v0.2.0</span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Мой портфель
            <ChevronRight size={14} />
            <span>{current.label}</span>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <span className="status-dot" />
              Локальная база
            </span>
            <select
              aria-label="Валюта отображения"
              value={base}
              onChange={(e) =>
                act(
                  () =>
                    window.invest.saveSettings({
                      ...state.settings,
                      baseCurrency: e.target.value as typeof base,
                    }),
                  "Валюта отображения изменена",
                )
              }
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "overview"
                  ? "ВАШ КАПИТАЛ, ВАША СТРАТЕГИЯ"
                  : "INVEST MANAGER"}
              </div>
              <h1>
                {page === "overview"
                  ? "Инвестиции под контролем"
                  : current.label}
              </h1>
              <p>{current.subtitle}</p>
            </div>
            <div className="heading-actions">
              {page === "sources" ? (
                <button
                  className="button primary"
                  onClick={sync}
                  disabled={syncing}
                >
                  <RefreshCw size={16} className={syncing ? "spin" : ""} />
                  {syncing ? "Обновляем…" : "Обновить источники"}
                </button>
              ) : (
                page !== "settings" && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => setDialog({ type: "operation" })}
                    >
                      <Plus size={16} />
                      Операция
                    </button>
                    {newButton}
                  </>
                )
              )}
            </div>
          </div>
          {!rate && (
            <Banner>
              Нет курса {base} для пересчёта. Обновите курсы в источниках или
              введите курс вручную.
            </Banner>
          )}
          {page === "overview" && (
            <>
              {!state.operations.length && (
                <section className="welcome-banner">
                  <div className="welcome-copy">
                    <span className="pill">НАЧНЁМ С ВАШЕГО ВКЛАДА</span>
                    <h2>Первый шаг к полной картине</h2>
                    <p>
                      Добавьте существующий депозит. Здесь появятся капитал,
                      доход и ближайшие выплаты.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => add("deposit")}
                    >
                      Добавить мой вклад
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="welcome-art" aria-hidden="true">
                    <div className="art-orbit" />
                    <div className="art-card">
                      <Landmark size={36} />
                      <span>Мой капитал</span>
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="art-check">
                      <Check size={24} />
                    </div>
                  </div>
                </section>
              )}
              <div className="metrics-grid">
                <Metric
                  label="Стоимость портфеля"
                  value={display(p.totalByn)}
                  hint={
                    p.hasAutoAccrual
                      ? `Включая расчётные проценты · ${base}`
                      : `Активы + деньги · ${base}`
                  }
                />
                <Metric
                  label="Общий результат"
                  value={display(p.profitByn)}
                  hint="Стоимость + выводы − пополнения"
                  positive={(p.profitByn ?? 0) > 0}
                />
                <Metric
                  label="Получено выплат"
                  value={display(p.incomeByn)}
                  hint="Проценты, купоны, дивиденды"
                  positive={p.incomeByn > 0}
                />
                <Metric
                  label="Доходность XIRR"
                  value={
                    p.annualReturn === null
                      ? "—"
                      : `${num(p.annualReturn * 100)}%`
                  }
                  hint={
                    p.hasAutoAccrual
                      ? "Годовая · с начисленными процентами · оценка в BYN"
                      : "Годовая · с учётом дат · в BYN"
                  }
                  positive={(p.annualReturn ?? 0) > 0}
                />
              </div>
              {p.hasAutoAccrual && (
                <section
                  className="panel accrual-summary"
                  aria-label="Автоматический расчёт процентов"
                >
                  <div>
                    <h3>Расчётные проценты: {display(p.accruedByn)}</h3>
                    <p>
                      Начислено по условиям вкладов на {dateLabel(asOf)}. Уже
                      включено в стоимость, результат и XIRR. Пересчитывается
                      каждый день.
                    </p>
                  </div>
                  <p>
                    Подтверждённые выплаты показаны отдельно. При записи выплаты
                    соответствующая сумма вычитается из расчётных процентов.
                  </p>
                </section>
              )}
              {p.warnings.length > 0 && (
                <details className="data-warning">
                  <summary>
                    Уточнить данные для оценки · {p.warnings.length}
                  </summary>
                  {p.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </details>
              )}
              <div className="overview-grid">
                <section className="panel performance-panel">
                  <div className="section-title">
                    <div>
                      <h2>Динамика капитала</h2>
                      <p>Стоимость и чистые вложения · BYN</p>
                    </div>
                    <div className="segmented">
                      {[
                        [30, "1М"],
                        [90, "3М"],
                        [365, "1Г"],
                        [36500, "Всё"],
                      ].map(([n, l]) => (
                        <button
                          key={n}
                          className={period === n ? "selected" : ""}
                          onClick={() => setPeriod(Number(n))}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {history.length ? (
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={history}
                          margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="capital"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#269985"
                                stopOpacity={0.2}
                              />
                              <stop
                                offset="100%"
                                stopColor="#269985"
                                stopOpacity={0.01}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="#edf0f4" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(v) =>
                              new Date(v).toLocaleDateString("ru-RU", {
                                day: "numeric",
                                month: "short",
                              })
                            }
                            axisLine={false}
                            tickLine={false}
                            minTickGap={45}
                          />
                          <YAxis
                            tickFormatter={(v) => num(v, 0)}
                            axisLine={false}
                            tickLine={false}
                            width={66}
                          />
                          <Tooltip
                            formatter={(v) => money(Number(v))}
                            labelFormatter={(v) => dateLabel(String(v))}
                          />
                          <Area
                            isAnimationActive={false}
                            dataKey="invested"
                            name="Чистые вложения"
                            type="stepAfter"
                            stroke="#afbac8"
                            fill="none"
                            strokeDasharray="4 4"
                          />
                          <Area
                            isAnimationActive={false}
                            dataKey="value"
                            name="Стоимость"
                            type="stepAfter"
                            stroke="#178979"
                            fill="url(#capital)"
                            strokeWidth={2.5}
                            connectNulls={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-chart">
                      <div className="empty-chart-grid" />
                      <TrendingUp size={34} />
                      <strong>История начнётся с первой операции</strong>
                      <span>Пополнения и доход будут показаны отдельно</span>
                    </div>
                  )}
                  <div className="chart-legend">
                    <span>
                      <i className="green-dot" />
                      Стоимость
                    </span>
                    <span>
                      <i className="gray-dot" />
                      Чистые вложения
                    </span>
                    <small>
                      Между котировками — последняя известная оценка
                    </small>
                  </div>
                </section>
                <section className="panel allocation-panel">
                  <div className="section-title">
                    <div>
                      <h2>Структура портфеля</h2>
                      <p>Распределение по типам активов</p>
                    </div>
                  </div>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          isAnimationActive={false}
                          data={
                            allocations.length
                              ? allocations
                              : [
                                  {
                                    name: "Нет активов",
                                    value: 1,
                                    color: "#edf0f4",
                                  },
                                ]
                          }
                          innerRadius={69}
                          outerRadius={90}
                          dataKey="value"
                          paddingAngle={allocations.length > 1 ? 3 : 0}
                          stroke="none"
                        >
                          {(allocations.length
                            ? allocations
                            : [{ color: "#edf0f4" }]
                          ).map((a, n) => (
                            <Cell key={n} fill={a.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-label">
                      <strong>{active.length}</strong>
                      <span>активов</span>
                    </div>
                  </div>
                  <div className="allocation-legend">
                    {(allocations.length
                      ? allocations
                      : kinds.map((k, n) => ({
                          name: kindLabels[k],
                          value: 0,
                          color: palette[n],
                        }))
                    ).map((a) => (
                      <div key={a.name}>
                        <span>
                          <i style={{ background: a.color }} />
                          {a.name}
                        </span>
                        <b>
                          {p.totalByn && a.value
                            ? `${num((a.value / p.totalByn) * 100, 1)}%`
                            : "—"}
                        </b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>Ближайшие выплаты</h2>
                      <p>Ожидаемые поступления по условиям</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("calendar")}
                    >
                      Календарь
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {payments.length ? (
                    payments.slice(0, 3).map((x, n) => (
                      <div className="payment-row" key={n}>
                        <div className="date-tile">
                          <b>{x.date.slice(8)}</b>
                          <span>
                            {new Date(x.date).toLocaleDateString("ru-RU", {
                              month: "short",
                            })}
                          </span>
                        </div>
                        <div className="grow">
                          <strong>{x.instrument.name}</strong>
                          <small>{x.type}</small>
                        </div>
                        <b>{money(x.amount, x.instrument.currency)}</b>
                      </div>
                    ))
                  ) : (
                    <div className="compact-empty">
                      <CalendarDays size={26} />
                      <p>
                        Укажите даты и периодичность выплат в карточке актива.
                      </p>
                    </div>
                  )}
                </section>
                <section className="panel soft">
                  <div className="idea-icon">
                    <Sparkles size={22} />
                  </div>
                  <h2>Помните, почему вы покупали</h2>
                  <p>
                    Сохраняйте идею каждой покупки: цель, ожидания, риски и
                    условия продажи. Возвращайтесь к ней, когда рынок меняется.
                  </p>
                  <button className="text-button" onClick={() => go("journal")}>
                    Открыть журнал решений
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              {state.operations.length > 0 && (
                <section className="panel">
                  <div className="section-title">
                    <h2>Последние операции</h2>
                    <button
                      className="text-button"
                      onClick={() => go("journal")}
                    >
                      Все операции
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {operationTable(latestOperations.slice(0, 5))}
                </section>
              )}
            </>
          )}
          {page === "assets" && (
            <>
              <div className="toolbar">
                <div className="tabs">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    Все инструменты
                  </button>
                  {kinds.map((k) => (
                    <button
                      key={k}
                      className={filter === k ? "selected" : ""}
                      onClick={() => setFilter(k)}
                    >
                      {kindLabels[k]}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Название или площадка"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {!assetRows.length ? (
                <section className="panel">
                  <Empty
                    title={
                      state.instruments.length
                        ? "Ничего не найдено"
                        : "Здесь будут ваши активы"
                    }
                    description="Добавьте инструмент вручную или выберите его в каталоге. Покупки и выплаты сохраняются отдельными операциями."
                    action={newButton}
                  />
                </section>
              ) : (
                <div className="asset-grid">
                  {assetRows.map((pos) => {
                    const i = pos.instrument;
                    const buys = state.operations.filter(
                      (o) => o.instrumentId === i.id && o.kind === "buy",
                    );
                    return (
                      <section className="panel asset-card" key={i.id}>
                        <div className="asset-card-top">
                          <div className={`asset-icon ${i.kind}`}>
                            {i.kind === "deposit" ? (
                              <Landmark size={24} />
                            ) : (
                              i.name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="grow">
                            <h3>{i.name}</h3>
                            <p>
                              {i.provider} · {i.currency}
                              {i.ticker ? ` · ${i.ticker}` : ""}
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Редактировать ${i.name}`}
                            onClick={() =>
                              setDialog({ type: "instrument", value: i })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                        <span className="tag">
                          {kindLabels[i.kind]}
                          {!pos.quantity ? " · Наблюдение" : ""}
                        </span>
                        <div className="asset-value">
                          {money(pos.quantity * pos.price, i.currency)}
                          <small>
                            {i.kind === "deposit"
                              ? `Тело вклада · ставка ${num(depositRateAt(i, asOf))}% годовых`
                              : `${num(pos.quantity, 8)} ед. · ${pos.estimated ? "по стоимости покупки" : pos.priceDate ? `цена от ${dateLabel(pos.priceDate)}` : "нет цены"}`}
                          </small>
                        </div>
                        <div className="inline-stats">
                          <div>
                            <span>Полученный доход</span>
                            <b>{display(pos.incomeByn)}</b>
                          </div>
                          <div>
                            <span>Погашение</span>
                            <b>{i.maturity ? dateLabel(i.maturity) : "—"}</b>
                          </div>
                        </div>
                        {i.kind === "deposit" && i.autoAccrual !== false && (
                          <div className="inline-stats">
                            <div>
                              <span>Расчётные проценты</span>
                              <b>{money(pos.accrued, i.currency)}</b>
                            </div>
                            <div>
                              <span>За день по текущей ставке</span>
                              <b>{money(pos.dailyInterest, i.currency)}</b>
                            </div>
                          </div>
                        )}
                        {buys.length > 0 && (
                          <details className="thesis-details">
                            <summary>
                              <BookOpen size={15} />
                              Причины покупок · {buys.length}
                            </summary>
                            {buys.map((o) => (
                              <div className="thesis" key={o.id}>
                                <strong>
                                  {dateLabel(o.date)} ·{" "}
                                  {money(operationValue(o), o.currency)}
                                </strong>
                                <p>{o.thesis.reason}</p>
                                {(
                                  [
                                    ["goal", "Цель"],
                                    ["horizon", "Горизонт"],
                                    ["expectation", "Ожидания"],
                                    ["risks", "Риски"],
                                    ["exit", "Условия выхода"],
                                  ] as const
                                )
                                  .filter(([k]) => o.thesis[k])
                                  .map(([k, l]) => (
                                    <p key={k}>
                                      <b>{l}:</b> {o.thesis[k]}
                                    </p>
                                  ))}
                              </div>
                            ))}
                          </details>
                        )}
                        <div className="asset-footer">
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setSelected(i.id);
                              go("analysis");
                            }}
                          >
                            Анализ
                            <ArrowUpRight size={15} />
                          </button>
                          {i.kind !== "deposit" && (
                            <button
                              className="text-button"
                              onClick={() =>
                                setDialog({ type: "quote", value: i })
                              }
                            >
                              Цена
                            </button>
                          )}
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({
                                type: "operation",
                                instrumentId: i.id,
                              })
                            }
                          >
                            Операция
                            <Plus size={15} />
                          </button>
                          {!state.operations.some(
                            (o) => o.instrumentId === i.id,
                          ) && (
                            <button
                              className="icon-button danger"
                              aria-label={`Удалить ${i.name}`}
                              onClick={() =>
                                setDialog({
                                  type: "confirm",
                                  title: "Удалить инструмент?",
                                  text: i.name,
                                  action: async () => {
                                    setState(
                                      await window.invest.removeInstrument(
                                        i.id,
                                      ),
                                    );
                                    setDialog(null);
                                  },
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              {p.cash.length > 0 && (
                <section className="panel">
                  <div className="section-title">
                    <h2>Денежные остатки</h2>
                  </div>
                  <div className="cash-grid">
                    {p.cash.map((c) => (
                      <div key={`${c.provider}:${c.currency}`}>
                        <span>{c.provider}</span>
                        <strong>{money(c.amount, c.currency)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {page === "analysis" && (
            <>
              <ResearchImport
                catalog={state.catalog}
                open={analyzeCatalog}
                manual={() => add("bond")}
              />
              <Analysis
                key={selected}
                state={state}
                selected={selected}
                select={setSelected}
                edit={(i) => setDialog({ type: "instrument", value: i })}
                quote={(i) => setDialog({ type: "quote", value: i })}
                buy={(id) => setDialog({ type: "operation", instrumentId: id })}
                openSource={source}
              />
            </>
          )}
          {page === "journal" && (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Внесено извне"
                  value={display(p.depositsByn)}
                  hint="Пополнения с учётом курса операции"
                />
                <Metric
                  label="Выведено"
                  value={display(p.withdrawalsByn)}
                  hint="Деньги, выведенные из портфеля"
                />
                <Metric
                  label="Комиссии"
                  value={display(p.feesByn)}
                  hint="Учтены в общем результате"
                />
                <Metric
                  label="Результат продаж"
                  value={display(p.realizedByn)}
                  hint="По средневзвешенной стоимости"
                />
              </div>
              <section className="panel">
                <div className="section-title">
                  <h2>
                    Все операции{" "}
                    <span className="count">{state.operations.length}</span>
                  </h2>
                  <button
                    className="button secondary small"
                    onClick={async () => {
                      try {
                        const path = await window.invest.exportCsv();
                        if (path)
                          setToast({ text: `Экспорт сохранён: ${path}` });
                      } catch (e) {
                        notifyError(e);
                      }
                    }}
                  >
                    <Download size={15} />
                    Экспорт CSV
                  </button>
                </div>
                <div className="toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="Найти операцию или идею"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Фильтр операций"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Все операции</option>
                    {Object.entries(operationLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                {state.operations.length ? (
                  operationTable(
                    latestOperations.filter(
                      (o) =>
                        (filter === "all" || o.kind === filter) &&
                        `${o.thesis.reason} ${o.note} ${o.provider} ${state.instruments.find((i) => i.id === o.instrumentId)?.name ?? ""}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    ),
                  )
                ) : (
                  <Empty
                    title="В журнале пока пусто"
                    description="Добавьте существующий вклад или первую операцию. Здесь сохранятся даты, суммы и ваши решения."
                  />
                )}
              </section>
            </>
          )}
          {page === "calendar" && (
            <>
              <Banner>
                Прогноз по регулярному графику из карточек инструментов. Купоны
                рассчитаны как номинал × ставка / число выплат в год. Для
                фактического дохода добавьте операцию «Выплата дохода». При
                капитализации запишите выплату и покупку на эту сумму из остатка
                счёта.
              </Banner>
              <section className="panel">
                {payments.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Инструмент</th>
                          <th>Событие</th>
                          <th>Сумма</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {payments.slice(0, 300).map((x, n) => (
                          <tr key={n}>
                            <td>{dateLabel(x.date)}</td>
                            <td>
                              <strong>{x.instrument.name}</strong>
                              <small>{x.instrument.provider}</small>
                            </td>
                            <td>{x.type}</td>
                            <td className="numeric">
                              {money(x.amount, x.instrument.currency)}
                            </td>
                            <td>
                              <span className="tag">План</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Календарь пока пуст"
                    description="Добавьте актив и заполните погашение, ближайшую выплату и периодичность. Если дата купона неизвестна, будет показан только возврат номинала."
                  />
                )}
              </section>
            </>
          )}
          {page === "sources" && (
            <>
              <div className="source-grid">
                {["Finstore", "Aigenis", "НБРБ"].map((name, n) => {
                  const run = state.syncRuns.find((r) => r.provider === name);
                  return (
                    <section className="panel source-card" key={name}>
                      <div
                        className="source-logo"
                        style={{ background: palette[n] }}
                      >
                        {name === "НБРБ" ? <Landmark size={24} /> : name[0]}
                      </div>
                      <h2>{name}</h2>
                      <p>
                        {
                          [
                            "Долговые токены · открытая витрина",
                            "Акции и облигации · открытая витрина",
                            "Официальные валютные курсы",
                          ][n]
                        }
                      </p>
                      <span
                        className={`source-status ${run?.status === "error" ? "error" : ""}`}
                      >
                        <span className="status-dot" />
                        {run
                          ? run.status === "ok"
                            ? "Обновлено"
                            : "Не удалось обновить"
                          : "Ещё не загружено"}
                      </span>
                      <small>
                        {run
                          ? `${dateLabel(run.date)} · ${new Date(run.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                          : "Обновление по запросу"}
                      </small>
                      {run && <p className="source-message">{run.message}</p>}
                      <button
                        className="text-button"
                        onClick={() =>
                          source(
                            [
                              "https://finstore.by/",
                              "https://aigenis.by/",
                              "https://www.nbrb.by/",
                            ][n],
                          )
                        }
                      >
                        Открыть сайт
                        <ExternalLink size={14} />
                      </button>
                    </section>
                  );
                })}
              </div>
              <Banner>
                Каталог содержит предложения с открытых страниц, а не весь
                рынок. Дата загрузки не равна дате котировки. Ставка, номинал и
                рыночная цена показаны отдельно; проверьте условия конкретного
                выпуска перед покупкой.
              </Banner>
              <section className="panel">
                <div className="section-title">
                  <div>
                    <h2>Найти следующий инструмент</h2>
                    <p>
                      {state.catalog.length} предложений · добавление в список
                      не создаёт покупку
                    </p>
                  </div>
                </div>
                <div className="toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="Название инструмента"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="tabs">
                    {["all", "Finstore", "Aigenis"].map((k) => (
                      <button
                        className={filter === k ? "selected" : ""}
                        key={k}
                        onClick={() => setFilter(k)}
                      >
                        {k === "all" ? "Все площадки" : k}
                      </button>
                    ))}
                  </div>
                </div>
                {state.catalog.length ? (
                  <div className="catalog-grid">
                    {state.catalog
                      .filter(
                        (c) =>
                          (filter === "all" || c.provider === filter) &&
                          c.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <article className="catalog-card" key={c.id}>
                          <div className="catalog-top">
                            <span className="tag">
                              {c.provider} · {kindLabels[c.kind]}
                            </span>
                            <span className="currency-tag">{c.currency}</span>
                          </div>
                          <h3>{c.name}</h3>
                          <div className="catalog-rate">
                            {c.rate === null
                              ? "По условиям"
                              : `${num(c.rate)}%`}
                            <small>
                              {c.rate === null
                                ? "Ставка не указана"
                                : "Купонная ставка в год"}
                            </small>
                          </div>
                          <div className="catalog-detail">
                            <span>{c.priceLabel}</span>
                            <b>
                              {c.price === null
                                ? "—"
                                : money(c.price, c.currency)}
                            </b>
                          </div>
                          {c.priceDate && (
                            <small>
                              Цена по состоянию на {dateLabel(c.priceDate)}
                            </small>
                          )}
                          {c.termMonths && (
                            <div className="catalog-detail">
                              <span>Срок выпуска</span>
                              <b>{c.termMonths} мес.</b>
                            </div>
                          )}
                          <p>{c.details}</p>
                          <div className="catalog-footer">
                            {["token", "bond"].includes(c.kind) && (
                              <button
                                className="button primary small"
                                disabled={analyzing}
                                onClick={() =>
                                  analyzeCatalog(c).catch(notifyError)
                                }
                              >
                                <Activity size={15} />
                                Проанализировать
                              </button>
                            )}
                            <button
                              className="button secondary small"
                              onClick={() => addCatalog(c)}
                            >
                              <Plus size={15} />В мой список
                            </button>
                            <button
                              className="icon-button"
                              title="Источник"
                              aria-label={`Источник ${c.name}`}
                              onClick={() => source(c.sourceUrl)}
                            >
                              <ExternalLink size={17} />
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <Empty
                    title="Загрузите открытый каталог"
                    description="Нажмите «Обновить источники». В случае недоступности площадки ручной учёт продолжит работать."
                    action={
                      <button
                        className="button primary"
                        disabled={syncing}
                        onClick={sync}
                      >
                        <RefreshCw
                          size={16}
                          className={syncing ? "spin" : ""}
                        />
                        Загрузить каталог
                      </button>
                    }
                  />
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="section-title">
                  <h2>Валюта и ориентир</h2>
                </div>
                <p className="muted">
                  Ориентир — ваша ставка для сравнения сценариев в одной валюте,
                  не предложение банка.
                </p>
                <form
                  className="settings-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await act(
                      () =>
                        window.invest.saveSettings({
                          ...state.settings,
                          benchmarkRate: Number(f.get("benchmark")),
                        }),
                      "Настройки сохранены",
                    );
                  }}
                >
                  <label>
                    Ставка депозита для сравнения, %
                    <input
                      name="benchmark"
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      required
                      defaultValue={state.settings.benchmarkRate}
                    />
                  </label>
                  <button className="button primary">
                    Сохранить настройки
                  </button>
                </form>
                <div className="section-title top-space">
                  <h3>Последние валютные курсы</h3>
                  <button
                    className="text-button"
                    onClick={() => setDialog({ type: "fx" })}
                  >
                    Ввести курс
                    <Plus size={15} />
                  </button>
                </div>
                {currencies
                  .filter((c) => c !== "BYN")
                  .map((c) => {
                    const r = fxAt(state, c, today());
                    return (
                      <div className="rate-row" key={c}>
                        <strong>1 {c}</strong>
                        <div>
                          <b>{r ? `${num(r.rate, 6)} BYN` : "Нет данных"}</b>
                          <small>
                            {r
                              ? `${dateLabel(r.date)} · ${r.source}`
                              : "Обновите источники или введите вручную"}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                <button
                  className="button secondary full"
                  onClick={sync}
                  disabled={syncing}
                >
                  <RefreshCw size={15} className={syncing ? "spin" : ""} />
                  Обновить источники и курсы
                </button>
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>Ваши данные</h2>
                  <Database size={21} />
                </div>
                <p>
                  SQLite хранится на этом компьютере. Автоматические копии
                  создаются при запуске: по одной на день недели.
                </p>
                <div className="path-box">{state.dbPath}</div>
                <p className="muted">
                  В этой версии база и резервные копии без шифрования и пароля.
                  Храните их в личной папке Windows. Код на GitHub не содержит
                  ваших инвестиций.
                </p>
                <div className="settings-buttons">
                  <button
                    className="button primary"
                    onClick={async () => {
                      try {
                        const path = await window.invest.backup();
                        if (path)
                          setToast({ text: `Копия сохранена: ${path}` });
                      } catch (e) {
                        notifyError(e);
                      }
                    }}
                  >
                    <Download size={16} />
                    Создать резервную копию
                  </button>
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        const result = await window.invest.restore();
                        if (result) {
                          setState(result);
                          setToast({ text: "Данные восстановлены" });
                        }
                      } catch (e) {
                        notifyError(e);
                      }
                    }}
                  >
                    <RefreshCw size={16} />
                    Восстановить из копии
                  </button>
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        const path = await window.invest.exportCsv();
                        if (path) setToast({ text: `CSV сохранён: ${path}` });
                      } catch (e) {
                        notifyError(e);
                      }
                    }}
                  >
                    <FileText size={16} />
                    Экспорт операций в CSV
                  </button>
                </div>
              </section>
              <section className="panel wide">
                <h2>Как считаются результаты</h2>
                <div className="method-grid">
                  <div>
                    <h4>Стоимость и прибыль</h4>
                    <p>
                      Последняя сохранённая цена × количество + денежные
                      остатки. Без цены используется стоимость покупки с
                      пометкой. Прибыль = стоимость + выводы − пополнения. Для
                      вкладов автоматически добавляются расчётные проценты за
                      прошедшие дни. Подтверждённые выплаты не дублируются.
                    </p>
                  </div>
                  <div>
                    <h4>Валюта и комиссии</h4>
                    <p>
                      Операции переводятся в BYN по введённому историческому
                      курсу, текущие остатки — по последнему курсу. Комиссии
                      покупки включены в среднюю стоимость. Валютный эффект
                      входит в общий результат.
                    </p>
                  </div>
                  <div>
                    <h4>Годовая доходность</h4>
                    <p>
                      XIRR использует даты внешних пополнений и выводов и
                      текущую стоимость, включая расчётные проценты вкладов. Это
                      годовая оценка, она может отличаться от номинальной ставки
                      договора. При неоднозначных денежных потоках или
                      отсутствии периода вместо значения показан прочерк. Налоги
                      не рассчитываются.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              Invest Manager <span>·</span> Личный инвестиционный журнал
            </span>
            <span>Данные и решения остаются у вас</span>
          </footer>
        </main>
      </div>
      {dialog?.type === "instrument" && (
        <InstrumentForm
          value={dialog.value}
          locked={state.operations.some(
            (o) => o.instrumentId === dialog.value.id,
          )}
          close={() => setDialog(null)}
          save={async (i, buy) => {
            setState(await window.invest.saveInstrument(i));
            setDialog(buy ? { type: "operation", instrumentId: i.id } : null);
            setToast({ text: "Инструмент сохранён" });
          }}
        />
      )}
      {dialog?.type === "operation" && (
        <OperationForm
          state={state}
          initialInstrument={dialog.instrumentId}
          existing={dialog.operation}
          close={() => setDialog(null)}
          save={async (v) => {
            setState(await window.invest.saveOperation(v));
            setDialog(null);
            setToast({ text: "Операция сохранена" });
          }}
        />
      )}
      {dialog?.type === "quote" && (
        <QuoteForm
          instrument={dialog.value}
          close={() => setDialog(null)}
          save={async (q) => {
            setState(await window.invest.saveQuote(q));
            setDialog(null);
            setToast({ text: "Цена сохранена" });
          }}
        />
      )}
      {dialog?.type === "fx" && (
        <FxForm
          close={() => setDialog(null)}
          save={async (f) => {
            setState(await window.invest.saveFx(f));
            setDialog(null);
            setToast({ text: "Курс сохранён" });
          }}
        />
      )}
      {dialog?.type === "confirm" && (
        <ConfirmDialog
          title={dialog.title}
          text={dialog.text}
          action={dialog.action}
          close={() => setDialog(null)}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <Activity size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Закрыть уведомление"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function ConfirmDialog({
  title,
  text,
  action,
  close,
}: {
  title: string;
  text: string;
  action: () => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} close={close}>
      <p>{text}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <button className="button secondary" onClick={close}>
          Отмена
        </button>
        <button
          className="button danger-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await action();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Удалить
        </button>
      </footer>
    </Modal>
  );
}
