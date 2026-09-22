import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import { Store } from "./store";
import { safeSourceUrl, syncSources } from "./sources";
import { today } from "../src/domain/types";

let store: Store;
let win: BrowserWindow;
let syncing: Promise<unknown> | undefined;
const testMode = process.env.INVEST_TEST_MODE === "1" && !app.isPackaged;
if (process.env.INVEST_DATA_DIR && !app.isPackaged)
  app.setPath("userData", process.env.INVEST_DATA_DIR);
const devUrl =
  !app.isPackaged && process.env.VITE_DEV_SERVER_URL === "http://127.0.0.1:5173"
    ? process.env.VITE_DEV_SERVER_URL
    : undefined;
const rendererPath = join(__dirname, "../dist/index.html");
const allowedUrl = devUrl ?? pathToFileURL(rendererPath).href;
const locked = testMode || app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      store = new Store(join(app.getPath("userData"), "data", "invest.sqlite"));
      win = new BrowserWindow({
        width: 1440,
        height: 980,
        minWidth: 1060,
        minHeight: 720,
        title: "Invest Manager",
        backgroundColor: "#f7f8fa",
        show: !testMode,
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (url !== allowedUrl && url !== `${allowedUrl}/`)
          event.preventDefault();
      });
      win.webContents.session.setPermissionRequestHandler((_, __, callback) =>
        callback(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      function handle(channel: string, fn: (input: any) => unknown) {
        ipcMain.handle(channel, async (event, input) => {
          if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            ![allowedUrl, `${allowedUrl}/`].includes(event.senderFrame.url)
          )
            return { ok: false, error: "Недоверенный источник запроса" };
          try {
            return { ok: true, value: await fn(input) };
          } catch (e) {
            return {
              ok: false,
              error:
                e instanceof ZodError
                  ? e.issues.map((i) => i.message).join("; ")
                  : e instanceof Error
                    ? e.message
                    : "Не удалось выполнить действие",
            };
          }
        });
      }
      handle("portfolio:load", () => store.load());
      handle("instrument:save", (value) => store.saveInstrument(value));
      handle("instrument:remove", (id) => store.removeInstrument(id));
      handle("operation:save", (value) => store.saveOperation(value));
      handle("operation:remove", (id) => store.removeOperation(id));
      handle("quote:save", (value) => store.saveQuote(value));
      handle("fx:save", (value) => store.saveFx(value));
      handle("settings:save", (value) => store.saveSettings(value));
      handle("sources:sync", () => {
        syncing ??= syncSources(store).finally(() => {
          syncing = undefined;
        });
        return syncing;
      });
      handle("source:open", async (url) => {
        if (typeof url !== "string" || !safeSourceUrl(url))
          throw new Error(
            "Можно открыть только официальный сайт поддерживаемого источника",
          );
        await shell.openExternal(url);
      });
      handle("data:backup", async () => {
        const { filePath } = await dialog.showSaveDialog(win, {
          title: "Сохранить резервную копию",
          defaultPath: `invest-${today()}.sqlite`,
          filters: [{ name: "База SQLite", extensions: ["sqlite"] }],
        });
        if (!filePath) return null;
        if (filePath === store.path)
          throw new Error("Выберите другое имя файла");
        await store.backup(filePath);
        return filePath;
      });
      handle("data:restore", async () => {
        const { filePaths } = await dialog.showOpenDialog(win, {
          title: "Восстановить базу из копии",
          properties: ["openFile"],
          filters: [{ name: "База SQLite", extensions: ["sqlite", "backup"] }],
        });
        if (!filePaths[0]) return null;
        const { response } = await dialog.showMessageBox(win, {
          type: "question",
          buttons: ["Отмена", "Восстановить"],
          defaultId: 0,
          cancelId: 0,
          message: "Заменить текущие данные выбранной копией?",
          detail:
            "Перед заменой приложение сохранит страховую копию рядом с текущей базой.",
        });
        return response === 1 ? store.restore(filePaths[0]) : null;
      });
      handle("data:export", async () => {
        const { filePath } = await dialog.showSaveDialog(win, {
          defaultPath: `operations-${today()}.csv`,
          filters: [{ name: "CSV", extensions: ["csv"] }],
        });
        if (!filePath) return null;
        const state = store.load();
        const cell = (v: unknown) => {
          let s = String(v ?? "");
          if (/^[=+@\-]/.test(s)) s = `'${s}`;
          return `"${s.replaceAll('"', '""')}"`;
        };
        const rows: unknown[][] = [
          [
            "id",
            "date",
            "kind",
            "instrument",
            "provider",
            "currency",
            "quantity",
            "price",
            "amount",
            "fee",
            "fx_to_byn",
            "reason",
            "goal",
            "horizon",
            "expectation",
            "risks",
            "exit",
            "note",
          ],
        ];
        for (const o of state.operations)
          rows.push([
            o.id,
            o.date,
            o.kind,
            state.instruments.find((i) => i.id === o.instrumentId)?.name ?? "",
            o.provider,
            o.currency,
            o.quantity,
            o.price,
            o.amount,
            o.fee,
            o.fx,
            o.thesis.reason,
            o.thesis.goal,
            o.thesis.horizon,
            o.thesis.expectation,
            o.thesis.risks,
            o.thesis.exit,
            o.note,
          ]);
        writeFileSync(
          filePath,
          "\ufeff" + rows.map((row) => row.map(cell).join(";")).join("\r\n"),
          "utf8",
        );
        return filePath;
      });
      const backupDir = join(app.getPath("userData"), "backups");
      mkdirSync(backupDir, { recursive: true });
      if (!testMode)
        await store.backup(
          join(backupDir, `auto-${new Date().getDay()}.sqlite`),
        );
      if (devUrl) await win.loadURL(devUrl);
      else await win.loadFile(rendererPath);
    })
    .catch((error) => {
      dialog.showErrorBox("Invest Manager", String(error));
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => store?.close());
}
