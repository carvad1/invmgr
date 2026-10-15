import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { importStockResponses } from "../../src/domain/stock-import";
import {
  parseBelarusbankDividends,
  parseEpfrDocuments,
} from "../../electron/stock-web-parsers";
import { emptyInstrument } from "../../src/domain/types";
import { emptyStockAnalysis } from "../../src/domain/stock-schema";
import type { StockWeb } from "../../src/domain/stock-web";

test("Автосбор: выплаты, текст PDF, локальное OCR, отзывчивый интерфейс и сохранение", async () => {
  test.setTimeout(150000);
  const root = resolve(".");
  mkdirSync(join(root, ".local"), { recursive: true });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    INVEST_TEST_MODE: "1",
    INVEST_DATA_DIR: mkdtempSync(join(root, ".local", "web-e2e-")),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1060, 850),
    );
    const pref = importStockResponses(
      readFileSync("tests/fixtures/aigenis-equity-card.json", "utf8"),
      [],
    ).instruments[0];
    const paid = parseBelarusbankDividends(
      readFileSync("tests/fixtures/belarusbank-dividends.html", "utf8"),
      pref,
      2026,
    );
    const dividendDoc = parseEpfrDocuments(
      JSON.parse(
        readFileSync("tests/fixtures/epfr-belarusbank-dividends.json", "utf8"),
      ),
      "100325912",
    )[0];
    const web: StockWeb = {
      checkedAt: new Date().toISOString(),
      status: "ok",
      identity: { unp: "100325912", id: 2668, name: "Беларусбанк" },
      sources: [],
      documents: [dividendDoc],
      issues: [],
      ...paid,
    };
    pref.stockAnalysis!.web = web;
    const prior = {
      ...emptyInstrument(),
      kind: "stock" as const,
      name: "Приорбанк А12",
      provider: "Aigenis",
      stockAnalysis: {
        ...emptyStockAnalysis(),
        web: {
          ...web,
          identity: { unp: "100220190", id: 4460, name: "Приорбанк" },
          dividends: [],
          shareInfo: null,
          documents: parseEpfrDocuments(
            JSON.parse(
              readFileSync(
                "tests/fixtures/epfr-priorbank-reports.json",
                "utf8",
              ),
            ),
            "100220190",
          ).filter((d) => d.id === "142508"),
        },
      },
    };
    await page.evaluate(
      async (rows) => {
        for (const i of rows) await window.invest.saveInstrument(i);
      },
      [pref, prior],
    );
    const responses = {
      dividend: readFileSync(
        "tests/fixtures/belarusbank-dividend-2025.pdf",
      ).toString("base64"),
      balance: readFileSync(
        "tests/fixtures/prior-balance-2026-scan.pdf",
      ).toString("base64"),
    };
    // Only this test process sees the HTTP fixture; the production collector and worker remain unchanged.
    await app.evaluate((_, responses) => {
      globalThis.fetch = async (input) =>
        new Response(
          Buffer.from(
            String(input).includes("142508")
              ? responses.balance
              : responses.dividend,
            "base64",
          ),
          { headers: { "content-type": "application/pdf" } },
        );
    }, responses);
    await page.reload();
    const navigate = async () =>
      page
        .getByRole("navigation")
        .getByRole("button", { name: "Акции", exact: true })
        .click();
    await navigate();
    await page.getByRole("button", { name: pref.name, exact: true }).click();
    await expect(
      page.locator(".metric").filter({ hasText: "Доходность по этой выплате" }),
    ).toContainText("3%");
    await page.getByLabel("Своя цена, необязательно").fill("1.5");
    await expect(
      page.locator(".metric").filter({ hasText: "Доходность по этой выплате" }),
    ).toContainText("4%");
    await page.getByLabel("Своя цена, необязательно").fill("");
    await page.screenshot({
      path: join(root, ".local", "stock-web-summary.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Оценка стоимости", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Взять за основу сценария DDM" })
      .click();
    await expect(
      page.getByLabel("Устойчивый дивиденд на акцию за год"),
    ).toHaveValue("0.06");
    await page.getByRole("button", { name: "Отчётность", exact: true }).click();
    await page.getByLabel("Тип документа").selectOption("dividend");
    await page.locator(".stock-document summary").first().click();
    await page
      .getByRole("button", { name: "Прочитать документ", exact: true })
      .click();
    await expect(page.locator(".stock-document-text")).toContainText("0,06", {
      timeout: 20000,
    });
    await page.getByLabel("Поиск в документах").fill("0,06");
    await expect(page.locator(".stock-document")).toHaveCount(1);
    await page.screenshot({
      path: join(root, ".local", "stock-web-documents.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "← Все акции", exact: true })
      .click();
    await page.getByRole("button", { name: prior.name, exact: true }).click();
    await page.getByRole("button", { name: "Отчётность", exact: true }).click();
    await page.locator(".stock-document summary").first().click();
    await page
      .getByRole("button", { name: "Прочитать документ", exact: true })
      .click();
    // OCR runs in a worker; changing sections must remain possible while it is processing.
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Обзор", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Обзор", exact: true }),
    ).toBeVisible({ timeout: 5000 });
    await navigate();
    await page.getByRole("button", { name: "Отчётность", exact: true }).click();
    await expect(page.locator(".stock-document summary")).toContainText(
      "Распознано из скана",
      { timeout: 90000 },
    );
    await page.locator(".stock-document summary").click();
    await expect(page.locator(".stock-document-text").first()).toContainText(
      /БАЛАНС|баланс/,
    );
    await page.screenshot({
      path: join(root, ".local", "stock-web-ocr.png"),
      fullPage: true,
    });
    const saved = await page.evaluate(() => window.invest.load());
    expect(
      saved.instruments.find((i) => i.id === prior.id)?.stockAnalysis?.web
        ?.documents[0].ocr,
    ).toBe(true);
    expect(
      saved.instruments.find((i) => i.id === prior.id)?.stockAnalysis?.reports,
    ).toHaveLength(0);
    expect(saved.operations).toHaveLength(0);
    await page.reload();
    await navigate();
    await page.getByRole("button", { name: pref.name, exact: true }).click();
    await expect(
      page.locator(".metric").filter({ hasText: "Доходность по этой выплате" }),
    ).toContainText("3%");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
