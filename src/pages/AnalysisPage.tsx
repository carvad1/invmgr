import { Suspense, lazy } from "react";
import type { CatalogItem } from "../domain/types";
import type { PageProps } from "../components/workspace";
import { BondScreener, type BondImport } from "../components/BondScreener";
import { ResearchImport } from "../components/QuickResearch";
const Analysis = lazy(() => import("../components/Analysis"));
export type AnalysisMode = "bonds" | "link" | "saved";
export default function AnalysisPage({
  state,
  p,
  actions,
  asOf,
  mode,
  setMode,
  selected,
  select,
  imported,
  setImported,
  sync,
  open,
  source,
}: PageProps & {
  mode: AnalysisMode;
  setMode: (mode: AnalysisMode) => void;
  selected: string;
  select: (id: string) => void;
  imported: BondImport;
  setImported: (value: BondImport) => void;
  sync: () => Promise<void>;
  open: (c: CatalogItem) => Promise<void>;
  source: (url: string) => void;
}) {
  return (
    <div className="page-stack">
      <div className="tabs" aria-label="Режим анализа">
        {(
          [
            ["bonds", "Облигации"],
            ["link", "По ссылке / каталог"],
            ["saved", "Мои расчёты"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={mode === id ? "active" : ""}
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "bonds" && (
        <BondScreener
          catalog={state.catalog}
          imported={imported}
          setImported={setImported}
          refresh={sync}
          open={open}
        />
      )}
      {mode === "link" && (
        <ResearchImport
          catalog={state.catalog}
          open={open}
          manual={actions.add}
        />
      )}
      {mode === "saved" && (
        <Suspense fallback={<p role="status">Открываем расчёт…</p>}>
          <Analysis
            state={{
              ...state,
              instruments: state.instruments.filter((i) => i.kind !== "stock"),
            }}
            p={p}
            asOf={asOf}
            selected={selected}
            select={select}
            edit={actions.edit}
            quote={actions.quote}
            buy={actions.buy}
            openSource={source}
          />
        </Suspense>
      )}
    </div>
  );
}
