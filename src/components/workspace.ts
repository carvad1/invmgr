import type { portfolio } from "../domain/finance";
import type { Instrument, Operation, State } from "../domain/types";
export type Portfolio = ReturnType<typeof portfolio>;
export type WorkspaceActions = {
  add: () => void;
  edit: (i: Instrument) => void;
  buy: (id?: string) => void;
  quote: (i: Instrument) => void;
  remove: (i: Instrument) => void;
  analyze: (id: string) => void;
  editOperation: (o: Operation) => void;
  removeOperation: (o: Operation) => void;
};
export type PageProps = {
  state: State;
  p: Portfolio;
  actions: WorkspaceActions;
  asOf: string;
};
