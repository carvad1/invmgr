import {
  useEffect,
  useRef,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { X, ArrowUpRight, FolderOpen } from "lucide-react";
export const money = (value: number | null, currency = "BYN", digits = 2) =>
  value === null || !Number.isFinite(value)
    ? "Нет данных"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value);
export const num = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
        Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value,
      );
export const dateLabel = (date: string) =>
  date
    ? new Date(date.slice(0, 10) + "T00:00:00").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Не указана";
export function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-inner">
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={close} aria-label="Закрыть">
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  wide = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <label htmlFor={fieldId}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child as ReactElement<{ id?: string }>, {
              id: fieldId,
            })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FolderOpen size={30} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  hint,
  positive = false,
}: {
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <small>
        {positive && <ArrowUpRight size={14} />} {hint}
      </small>
    </div>
  );
}
export function Banner({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
