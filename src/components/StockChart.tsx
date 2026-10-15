import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockAnalysis } from "../domain/stock-schema";
import { dateLabel, money } from "./ui";
export default function StockChart({
  history,
  currency,
}: {
  history: StockAnalysis["history"];
  currency: string;
}) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const step = Math.max(1, Math.ceil(sorted.length / 500));
  const data = sorted
    .filter((_, n) => n % step === 0 || n === sorted.length - 1)
    .map((p) => ({ ...p, time: Date.parse(p.date) }));
  return (
    <div className="stock-chart" aria-label="График загруженной цены">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              dateLabel(new Date(v).toISOString().slice(0, 10))
            }
            minTickGap={50}
          />
          <YAxis domain={["auto", "auto"]} width={70} />
          <Tooltip
            labelFormatter={(v) =>
              dateLabel(new Date(Number(v)).toISOString().slice(0, 10))
            }
            formatter={(v) => [money(Number(v), currency), "Цена"]}
          />
          <Line
            dataKey="close"
            type="linear"
            stroke="#126f67"
            strokeWidth={2}
            dot={data.length === 1}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {step > 1 && (
        <small>
          График прорежен для скорости; расчёты используют все {history.length}{" "}
          наблюдений.
        </small>
      )}
    </div>
  );
}
