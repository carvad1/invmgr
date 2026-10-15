import { useState } from "react";
import type { Instrument, Operation, State } from "../domain/types";
import { InstrumentForm, OperationForm, QuoteForm, FxForm } from "./forms";
import { Modal } from "./ui";
export type Dialog =
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

export default function AppDialogs({
  state,
  dialog,
  setState,
  setDialog,
  setToast,
}: {
  state: State;
  dialog: Dialog;
  setState: (value: State) => void;
  setDialog: (value: Dialog) => void;
  setToast: (value: { text: string; error?: boolean }) => void;
}) {
  return (
    <>
      {dialog?.type === "instrument" && (
        <InstrumentForm
          value={dialog.value}
          locked={state.operations.some(
            (o) => o.instrumentId === dialog.value.id,
          )}
          close={() => setDialog(null)}
          save={async (i, buy) => {
            setState(await window.invest.saveInstrument(i));
            void window.invest
              .refreshRates()
              .then(setState)
              .catch(() => {});
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
    </>
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
