import { portfolioHistory } from "../domain/history";
import type { State } from "../domain/types";
self.onmessage = (
  event: MessageEvent<{ state: State; asOf: string; period: number }>,
) => {
  try {
    self.postMessage({
      rows: portfolioHistory(
        event.data.state,
        event.data.asOf,
        event.data.period,
      ),
    });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
