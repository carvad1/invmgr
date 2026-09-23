import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CatalogItem } from "../../src/domain/types";
import { blankResearch } from "../../src/domain/research";

test("Быстрый анализ: ссылка, рейтинг, сценарий, сохранение и отсутствие покупки", async () => {
  const root = resolve(".");
  mkdirSync(join(root, ".local"), { recursive: true });
  const dir = mkdtempSync(join(root, ".local", "research-e2e-"));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    INVEST_DATA_DIR: dir,
    INVEST_TEST_MODE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: [root], env });
  let page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const item: CatalogItem = {
    id: "research-test",
    provider: "Finstore",
    kind: "token",
    name: "Тестовый выпуск",
    currency: "USD",
    price: 100,
    nominal: 100,
    rate: 10,
    frequency: 12,
    maturity: "2030-01-01",
    termMonths: 48,
    sourceUrl: "https://finstore.by/kupit-tokeny/123",
    fetchedAt: new Date().toISOString(),
    details: "Условия тестового выпуска",
    priceLabel: "Стоимость размещения",
    priceDate: "",
    research: {
      ...blankResearch("123", "Тестовая компания"),
      nominalKnown: true,
      rateKnown: true,
      rating: {
        value: "by.A reputation",
        kind: "reputation",
        agency: "",
        date: "",
        sourceUrl: "https://finstore.by/kupit-tokeny/123",
      },
    },
  };
  try {
    await page.getByRole("button", { name: "Анализ", exact: true }).click();
    await page.getByLabel("Ссылка на выпуск").fill("https://example.com/");
    await page.getByRole("button", { name: "Разобрать ссылку" }).click();
    await expect(page.getByRole("alert")).toContainText("Finstore");
    await app.evaluate(({ ipcMain }, data) => {
      ipcMain.removeHandler("source:inspect");
      ipcMain.handle("source:inspect", () => ({ ok: true, value: [data] }));
    }, item);
    await page.getByLabel("Ссылка на выпуск").fill(item.sourceUrl);
    await page.getByRole("button", { name: "Разобрать ссылку" }).click();
    await expect(
      page.getByRole("region", { name: "Оценка выпуска" }),
    ).toContainText("Недостаточно данных");
    await expect(
      page.getByRole("region", { name: "Оценка выпуска" }),
    ).toContainText("by.A reputation");
    await page.getByLabel("Бюджет анализа").fill("1000");
    await page
      .getByText("Комиссия", { exact: true })
      .locator("input")
      .fill("10");
    await expect(
      page.locator(".metric").filter({ hasText: "Процентный доход за период" }),
    ).toContainText("8,79%");
    let state = await page.evaluate(() => window.invest.load());
    expect(state.operations).toHaveLength(0);
    expect(state.instruments).toHaveLength(1);
    await page
      .getByRole("button", { name: "Дополнить данные для оценки" })
      .click();
    await page
      .getByText("Рейтинг, обеспечение и проверка выплат", { exact: true })
      .click();
    await page.getByLabel("Исполнение выплат").selectOption("late");
    await page.getByLabel("Дата проверки выплат").fill("2026-09-10");
    await page
      .getByLabel("Источник проверки выплат")
      .fill("https://finstore.by/blog/report");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Оценка выпуска" }),
    ).toContainText("Высокий риск по данным");
    await page.getByRole("button", { name: "Разобрать ссылку" }).click();
    state = await page.evaluate(() => window.invest.load());
    expect(state.instruments).toHaveLength(1);
    expect(state.operations).toHaveLength(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: join(root, ".local", "research-ui.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({ args: [root], env });
    page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Инвестиции под контролем" }),
    ).toBeVisible();
    state = await page.evaluate(() => window.invest.load());
    expect(state.instruments[0].research?.paymentStatus).toBe("late");
    expect(state.instruments[0].research?.rating?.kind).toBe("reputation");
    expect(state.operations).toHaveLength(0);
  } finally {
    await app.close();
  }
});
