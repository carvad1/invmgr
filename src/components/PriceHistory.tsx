import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { technicals } from "../domain/finance";
import type { Quote } from "../domain/types";
import { money, num } from "./ui";
export default function PriceHistory({
  quotes,
  currency,
}: {
  quotes: Quote[];
  currency: string;
}) {
  const tech = technicals(quotes.map((q) => q.price));
  return (
    <>
      {quotes.length > 1 ? (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={quotes}>
              <CartesianGrid vertical={false} stroke="#e8ecec" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v) => money(Number(v), currency)} />
              <Area
                dataKey="price"
                name="Цена"
                stroke="#217566"
                fill="#edf5f1"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted">
          График появится после добавления цен на две разные даты.
        </p>
      )}
      <div className="detail-grid compact">
        <div>
          <small>SMA 20</small>
          <b>{num(tech.sma20)}</b>
        </div>
        <div>
          <small>SMA 50</small>
          <b>{num(tech.sma50)}</b>
        </div>
        <div>
          <small>RSI 14</small>
          <b>{num(tech.rsi)}</b>
        </div>
      </div>
      <p className="footnote">
        {quotes.length} сохранённых наблюдений, не обязательно торговых дней.
        Для SMA нужны 20 / 50 цен, для RSI — 15. Индикаторы не являются сигналом
        к покупке.
      </p>
    </>
  );
}
