import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../src/domain/types";
const call = async (channel: string, input?: unknown) => {
  const result = await ipcRenderer.invoke(channel, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const api: DesktopAPI = {
  load: () => call("portfolio:load"),
  saveInstrument: (value) => call("instrument:save", value),
  removeInstrument: (id) => call("instrument:remove", id),
  saveOperation: (value) => call("operation:save", value),
  removeOperation: (id) => call("operation:remove", id),
  saveQuote: (value) => call("quote:save", value),
  saveFx: (value) => call("fx:save", value),
  saveSettings: (value) => call("settings:save", value),
  sync: () => call("sources:sync"),
  inspectSource: (url) => call("source:inspect", url),
  backup: () => call("data:backup"),
  restore: () => call("data:restore"),
  exportCsv: () => call("data:export"),
  openSource: (url) => call("source:open", url),
};
contextBridge.exposeInMainWorld("invest", api);
