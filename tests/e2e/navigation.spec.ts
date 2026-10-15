import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

test("Минимальный интерфейс: быстрый запуск, вставка Aigenis, страницы и сохранение импорта", async () => {
  const root = resolve(".");
  mkdirSync(join(root, ".local"), { recursive: true });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    INVEST_DATA_DIR: mkdtempSync(join(root, ".local", "navigation-")),
    INVEST_TEST_MODE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await expect(
      page.getByRole("heading", { name: "Обзор", exact: true }),
    ).toBeVisible();
    // The network request never resolves: local navigation must still work.
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      ipcMain.removeHandler("rates:refresh");
      ipcMain.handle("rates:refresh", () => new Promise(() => {}));
      BrowserWindow.getAllWindows()[0].setContentSize(1060, 720);
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Обзор", exact: true }),
    ).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Анализ", exact: true }).click();
    await page
      .getByRole("button", { name: "Вставить из Aigenis", exact: true })
      .click();
    await page.getByLabel("JSON карточек облигаций").fill("Это не JSON");
    await page
      .getByRole("button", { name: "Показать облигации", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "JSON",
    );
    const rows = Array.from({ length: 47 }, (_, n) => ({
      trading_session_id: "NDA",
      best_offer: n === 1 ? 0 : 101,
      calc_yield_offer: 12 + n / 100,
      trading_status_updated_at: "2026-09-26T12:00:00",
      definition: {
        product: "bond",
        security_symbol: `TEST${n}`,
        parent_symbol: `Выпуск ${String(n).padStart(2, "0")}`,
        currency: "BYN",
        coupon_rate: 14,
        nominal: 100,
        maturity_date: "2028-09-26",
        last_deal_price: 100,
        calc_yield_last_deal: 15,
        revenue_type: n === 0 ? "indexed" : "percent",
        rating_level: { level_name: "Без рейтинга" },
        issuer: {
          full_name: "Учебная компания",
          issuer_group_data:
            n === 0
              ? {
                  message: "Тестовое предупреждение об исполнении обязательств",
                }
              : null,
        },
      },
    }));
    await page
      .getByLabel("JSON карточек облигаций")
      .fill(JSON.stringify({ results: rows }));
    await page
      .getByRole("button", { name: "Показать облигации", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Выпуск 20", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByRole("button", { name: "Выпуск 00", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Тестовое предупреждение",
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Выпуск индексируемый",
    );
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    const fallbackRow = page
      .locator("tr")
      .filter({
        has: page.getByRole("button", { name: "Выпуск 01", exact: true }),
      });
    await expect(fallbackRow).toContainText("15%");
    await expect(fallbackRow).toContainText("По последней сделке · ориентир");
    await page.getByRole("button", { name: "Выпуск 01", exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("region", { name: "Цена для анализа" }),
    ).toContainText("100 BYN");
    await expect(page.getByRole("dialog")).toContainText(
      "Ориентировочная доходность",
    );
    await page.screenshot({
      path: join(root, ".local", "last-price-analysis.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByLabel("Сортировка облигаций").selectOption("yield");
    await expect(page.locator("tbody tr").first()).toContainText("Выпуск 01");
    await page.getByLabel("Сортировка облигаций").selectOption("name");
    for (const name of [
      "Мои активы",
      "Операции",
      "Календарь выплат",
      "Настройки",
      "Обзор",
      "Анализ",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (name === "Настройки")
        await page.screenshot({
          path: join(root, ".local", "settings-minimal.png"),
          fullPage: true,
        });
    }
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await page.getByLabel("Поиск облигации").fill("Выпуск 46");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Выпуск 46", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Поиск облигации").fill("");
    await page.screenshot({
      path: join(root, ".local", "bonds-minimal.png"),
      fullPage: true,
    });
    expect(
      (await page.evaluate(() => window.invest.load())).operations,
    ).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
