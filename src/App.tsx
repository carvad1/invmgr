import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { emptyStockAnalysis } from "./domain/stock-schema";
import { stockIssuerUnp, stockWebIdentity } from "./domain/stock-web";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  Settings2,
  Wallet,
  TrendingUp,
  X,
} from "lucide-react";
import {
  emptyInstrument,
  today,
  type CatalogItem,
  type Instrument,
  type State,
} from "./domain/types";
import { portfolio } from "./domain/finance";
import { catalogInstrument } from "./domain/research";
import AppDialogs, { type Dialog } from "./components/AppDialogs";
import type { WorkspaceActions } from "./components/workspace";
import type { BondImport } from "./components/BondScreener";
import type { AnalysisMode } from "./pages/AnalysisPage";
import Overview from "./pages/Overview";
import Assets from "./pages/Assets";
import Journal from "./pages/Journal";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const Stocks = lazy(() => import("./pages/Stocks"));

const pages = [
  {
    id: "overview",
    label: "Обзор",
    icon: LayoutDashboard,
    subtitle: "Стоимость, результат и ближайшие выплаты",
  },
  {
    id: "assets",
    label: "Мои активы",
    icon: Wallet,
    subtitle: "Позиции и сохранённые инструменты",
  },
  {
    id: "analysis",
    label: "Анализ",
    icon: Activity,
    subtitle: "Сравнение выпусков и расчёт дохода",
  },
  {
    id: "stocks",
    label: "Акции",
    icon: TrendingUp,
    subtitle: "Бизнес, стоимость и риски компании",
  },
  {
    id: "journal",
    label: "Операции",
    icon: BookOpen,
    subtitle: "Покупки, выплаты и движение денег",
  },
  {
    id: "calendar",
    label: "Календарь выплат",
    icon: CalendarDays,
    subtitle: "Предстоящие поступления по вашим активам",
  },
  {
    id: "settings",
    label: "Настройки",
    icon: Settings2,
    subtitle: "Отображение, источники и резервные копии",
  },
] as const;
type Page = (typeof pages)[number]["id"];

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
  const [selected, setSelected] = useState("");
  const [stockSelected, setStockSelected] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [mode, setMode] = useState<AnalysisMode>("bonds");
  const [imported, setImported] = useState<BondImport>({ rows: [], raw: "" });
  const [stockBusy, setStockBusy] = useState(false);
  const stockRequests = useRef(0);
  useEffect(
    () =>
      window.invest?.onStockWeb((change) =>
        setState((previous) =>
          previous
            ? {
                ...previous,
                instruments: previous.instruments.map((i) =>
                  i.id === change.id && stockWebIdentity(i) === change.identity
                    ? {
                        ...i,
                        stockAnalysis: {
                          ...(i.stockAnalysis ?? emptyStockAnalysis()),
                          web: change.web,
                        },
                      }
                    : i,
                ),
              }
            : previous,
        ),
      ),
    [],
  );
  const applyStockWeb = useCallback(
    (next: State) =>
      setState((previous) =>
        previous
          ? {
              ...previous,
              instruments: previous.instruments.map((i) => {
                const updated = next.instruments.find((n) => n.id === i.id);
                return updated?.stockAnalysis?.web &&
                  stockWebIdentity(updated) === stockWebIdentity(i)
                  ? {
                      ...i,
                      stockAnalysis: {
                        ...(i.stockAnalysis ?? emptyStockAnalysis()),
                        web: updated.stockAnalysis.web,
                      },
                    }
                  : i;
              }),
            }
          : previous,
      ),
    [],
  );
  const refreshStocks = useCallback(
    async (id?: string, force = false) => {
      stockRequests.current++;
      setStockBusy(true);
      try {
        applyStockWeb(await window.invest.refreshStocks({ id, force }));
      } catch (e) {
        if (force)
          setToast({
            text: e instanceof Error ? e.message : String(e),
            error: true,
          });
      } finally {
        stockRequests.current--;
        setStockBusy(stockRequests.current > 0);
      }
    },
    [applyStockWeb],
  );
  const readStockDocument = useCallback(
    async (id: string, documentId: string) => {
      applyStockWeb(await window.invest.readStockDocument(id, documentId));
    },
    [applyStockWeb],
  );
  const stockSignature =
    state?.instruments
      .filter((i) => i.kind === "stock")
      .map(stockWebIdentity)
      .join("|") ?? "";
  useEffect(() => {
    if (!stockSignature || state?.settings.stockAutoRefresh === false) return;
    void refreshStocks();
    const timer = setInterval(() => void refreshStocks(), 30 * 60000);
    return () => clearInterval(timer);
  }, [stockSignature, state?.settings.stockAutoRefresh, refreshStocks]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (!window.invest) {
      setFatal(
        "Откройте Invest Manager.exe. База доступна в установленном приложении.",
      );
      return;
    }
    let disposed = false;
    window.invest
      .load()
      .then((value) => {
        if (!disposed) setState(value);
      })
      .catch((e) => setFatal(e.message));
    // Internet requests run independently of opening the local database.
    const refresh = () =>
      window.invest
        .refreshRates()
        .then((value) => {
          if (!disposed) setState(value);
        })
        .catch(() => {});
    void refresh();
    const rates = setInterval(refresh, 15 * 60000);
    const tick = setInterval(() => setAsOf(today()), 60000);
    const focus = () => setAsOf(today());
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      clearInterval(rates);
      clearInterval(tick);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const p = useMemo(
    () => (state ? portfolio(state, asOf) : null),
    [
      state?.instruments,
      state?.operations,
      state?.quotes,
      state?.fxRates,
      asOf,
    ],
  );
  const notify = (text: string, error = false) => setToast({ text, error });
  const notifyError = (e: unknown) =>
    notify(e instanceof Error ? e.message : String(e), true);
  if (fatal)
    return (
      <div className="fatal">
        <h1>Не удалось открыть базу</h1>
        <p>{fatal}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Повторить
        </button>
      </div>
    );
  if (!state || !p)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <span>Открываем портфель…</span>
      </div>
    );
  const add = () =>
    setDialog({
      type: "instrument",
      value:
        page === "stocks"
          ? {
              ...emptyInstrument(),
              kind: "stock",
              provider: "Aigenis",
              frequency: 0,
            }
          : emptyInstrument(),
    });
  const analyze = (id: string) => {
    if (state.instruments.find((i) => i.id === id)?.kind === "stock") {
      setStockSelected(id);
      setPage("stocks");
      return;
    }
    setSelected(id);
    setMode("saved");
    setPage("analysis");
  };
  const source = (url: string) => {
    window.invest.openSource(url).catch(notifyError);
  };
  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await window.invest.sync();
      setState(result);
      const failed = result.syncRuns.filter((s) => s.status === "error");
      notify(
        failed.length
          ? `Не обновились: ${failed.map((s) => s.provider).join(", ")}. Подробности в настройках.`
          : "Каталог и курсы обновлены",
        !!failed.length,
      );
    } catch (e) {
      notifyError(e);
    } finally {
      setSyncing(false);
    }
  };
  const analyzeCatalog = async (c: CatalogItem) => {
    if (analyzing) return;
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
      analyze(old.id);
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
      if (value.kind === "stock") {
        setStockSelected(value.id);
        setPage("stocks");
      } else analyze(value.id);
      notify("Расчёт сохранён. Покупка не записывалась.");
    } finally {
      setAnalyzing(false);
    }
  };
  const actions: WorkspaceActions = {
    add,
    analyze,
    edit: (value: Instrument) => setDialog({ type: "instrument", value }),
    buy: (instrumentId?: string) =>
      setDialog({ type: "operation", instrumentId }),
    quote: (value: Instrument) => setDialog({ type: "quote", value }),
    remove: (i) =>
      setDialog({
        type: "confirm",
        title: "Удалить актив?",
        text: `«${i.name}». Актив с операциями удалить нельзя: сначала удалите связанные операции.`,
        action: async () => {
          setState(await window.invest.removeInstrument(i.id));
          setDialog(null);
          notify("Актив удалён");
        },
      }),
    editOperation: (operation) => setDialog({ type: "operation", operation }),
    removeOperation: (o) =>
      setDialog({
        type: "confirm",
        title: "Удалить операцию?",
        text: "Связанное автопополнение удалится вместе с покупкой. Приложение проверит остатки после удаления.",
        action: async () => {
          setState(await window.invest.removeOperation(o.id));
          setDialog(null);
          notify("Операция удалена");
        },
      }),
  };
  const current = pages.find((x) => x.id === page)!;
  const props = { state, p, actions, asOf };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">im</span>
          <strong>Invest Manager</strong>
        </div>
        <nav aria-label="Основные разделы">
          {pages.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          Локальная база<small>Версия 0.6.0</small>
        </div>
      </aside>
      <main className="workspace" key={page}>
        <header className="page-heading">
          <div>
            <h1>{current.label}</h1>
            <p>{current.subtitle}</p>
          </div>
          {page !== "settings" && (
            <div className="button-row">
              {page !== "analysis" && page !== "stocks" && (
                <button
                  className="button secondary"
                  onClick={() => actions.buy()}
                >
                  Записать операцию
                </button>
              )}
              <button className="button primary" onClick={add}>
                <Plus size={16} />
                {page === "stocks" ? "Добавить акцию" : "Добавить актив"}
              </button>
            </div>
          )}
        </header>
        {page === "overview" && <Overview {...props} />}
        {page === "assets" && <Assets {...props} />}
        {page === "journal" && <Journal {...props} />}
        {page === "calendar" && <Calendar {...props} />}
        {page === "stocks" && (
          <Suspense fallback={<p role="status">Открываем акции…</p>}>
            <Stocks
              state={state}
              selected={stockSelected}
              select={setStockSelected}
              actions={actions}
              openSource={source}
              refreshStocks={refreshStocks}
              stockBusy={stockBusy}
              readDocument={readStockDocument}
              save={async (value) => {
                setState(await window.invest.saveInstrument(value));
                notify("Данные акции сохранены");
              }}
            />
          </Suspense>
        )}
        {page === "analysis" && (
          <Suspense fallback={<p role="status">Открываем анализ…</p>}>
            <AnalysisPage
              {...props}
              mode={mode}
              setMode={setMode}
              selected={selected}
              select={setSelected}
              imported={imported}
              setImported={setImported}
              sync={sync}
              open={analyzeCatalog}
              source={source}
            />
          </Suspense>
        )}
        {page === "settings" && (
          <Settings
            state={state}
            update={setState}
            notify={notify}
            sync={sync}
            syncing={syncing}
            fx={() => setDialog({ type: "fx" })}
          />
        )}
      </main>
      <AppDialogs
        state={state}
        dialog={dialog}
        setState={setState}
        setDialog={setDialog}
        setToast={setToast}
      />
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
