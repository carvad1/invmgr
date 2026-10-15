import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { State } from "../domain/types";
import { money, dateLabel } from "./ui";
type Row = { date: string; value: number | null; invested: number };
export default function PortfolioHistory({
  state,
  asOf,
}: {
  state: State;
  asOf: string;
}) {
  const [period, setPeriod] = useState(365);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setRows(null);
    setError("");
    const worker = new Worker(
      new URL("../workers/history.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e) => {
      setRows(e.data.rows ?? []);
      setError(e.data.error ?? "");
    };
    worker.onerror = () =>
      setError(
        "Не удалось рассчитать историю. Закройте и откройте график ещё раз.",
      );
    worker.postMessage({ state, asOf, period });
    return () => worker.terminate();
  }, [state, asOf, period]);
  return (
    <>
      <div className="toolbar">
        <select
          aria-label="Период графика"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          <option value={90}>3 месяца</option>
          <option value={365}>Год</option>
          <option value={1825}>5 лет</option>
        </select>
        <span className="muted">Стоимость и чистые вложения · BYN</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p role="status">
          Рассчитываем историю… Можно продолжать пользоваться приложением.
        </p>
      ) : rows.length < 2 ? (
        <p className="muted">
          Для графика нужны операции на более раннюю дату.
        </p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              <CartesianGrid vertical={false} stroke="#e8ecec" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis axisLine={false} tickLine={false} width={72} />
              <Tooltip
                formatter={(v) => money(Number(v))}
                labelFormatter={(v) => dateLabel(String(v))}
              />
              <Area
                dataKey="invested"
                name="Чистые вложения"
                stroke="#9aabb0"
                fill="transparent"
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
              <Area
                dataKey="value"
                name="Стоимость"
                stroke="#217566"
                fill="#edf5f1"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="footnote">
        До 25 снимков. График не показывает все движения между датами; точные
        операции доступны в журнале.
      </p>
    </>
  );
}
