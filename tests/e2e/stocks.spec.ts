import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

test("Акции: вставка, последняя цена, отчётность, DCF и сохранение после перезапуска", async () => {
  const root = resolve(".");
  mkdirSync(join(root, ".local"), { recursive: true });
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    INVEST_DATA_DIR: mkdtempSync(join(root, ".local", "stocks-")),
    INVEST_TEST_MODE: "1",
  };
  delete (env as Record<string, string>).ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1060, 800),
    );
    const navigate = () =>
      page
        .getByRole("navigation")
        .getByRole("button", { name: "Акции", exact: true })
        .click();
    await navigate();
    await expect(
      page.getByRole("heading", { name: "Акции", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Вставить из Aigenis", exact: true })
      .click();
    await page
      .getByLabel("JSON карточек акций")
      .fill('{"definition":{"product":"bond"}}');
    await page
      .getByRole("button", { name: "Добавить акции", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Акции не найдены",
    );
    await page.getByLabel("JSON карточек акций").fill(
      JSON.stringify({
        results: [
          {
            name_of_security: "Учебная акция",
            trading_session_id: "NDA",
            best_offer: 0,
            best_bid: 98,
            round_lot: 1,
            definition: {
              id: 7,
              product: "stock",
              security_symbol: "TEST-STOCK",
              currency: "BYN",
              last_deal_price: 100,
              issuer: { full_name: "Учебная компания" },
            },
          },
        ],
      }),
    );
    await page
      .getByRole("button", { name: "Добавить акции", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Учебная акция", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".stock-price-row")).toContainText("100");
    await expect(page.locator(".stock-price-row")).toContainText(
      "Последняя сделка · ориентир",
    );
    await page
      .getByRole("button", { name: "Добавить отчёт", exact: true })
      .click();
    const report = page.getByRole("dialog");
    await report.getByLabel("Конец 12-месячного периода").fill("2025-12-31");
    await report
      .getByLabel("Источник отчётности")
      .fill("Тестовый годовой отчёт, с. 1–5");
    for (const [label, value] of [
      ["Выручка", "1000000"],
      ["Чистая прибыль акционеров", "100000"],
      ["Собственный капитал акционеров", "500000"],
      ["Процентный долг", "150000"],
      ["Денежные средства", "50000"],
      ["EBITDA", "200000"],
      ["Операционный денежный поток", "120000"],
      ["Капитальные затраты (положительные)", "20000"],
      ["Акций в обращении, шт.", "10000"],
      ["Выплаченный дивиденд на акцию", "5"],
    ])
      await report.getByLabel(label, { exact: true }).fill(value);
    await report
      .getByRole("button", { name: "Сохранить отчёт", exact: true })
      .click();
    await expect(report).toHaveCount(0);
    await expect(
      page.locator(".metric").filter({ hasText: "Дивидендная доходность" }),
    ).toContainText("5%");
    await page.screenshot({
      path: join(root, ".local", "stocks-summary.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Оценка стоимости", exact: true })
      .click();
    await page.getByLabel("Нормализованный FCFE на акцию за год").fill("10");
    await page.getByLabel("Рост потока в год, %", { exact: true }).fill("0");
    await page
      .getByLabel("Требуемая доходность акционера, %", { exact: true })
      .fill("10");
    await page.getByLabel("Долгосрочный рост, %", { exact: true }).fill("0");
    await expect(
      page.locator(".metric").filter({ hasText: "Стоимость по модели" }),
    ).toContainText("100");
    await expect(
      page.getByText("Обратный DCF: 0% роста в год", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Сохранить допущения", exact: true })
      .click();
    await page.getByLabel("Своя цена, необязательно").fill("80");
    await expect(
      page.locator(".metric").filter({ hasText: "Отличие от цены анализа" }),
    ).toContainText("25%");
    await page
      .getByRole("button", { name: "Цена и риск", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Загрузить историю цен", exact: true })
      .click();
    await page.getByLabel("Источник истории").fill("Учебная история");
    await page
      .getByLabel("История: дата;цена")
      .fill("2025-01-01;100\n2025-02-01;120\n2025-03-01;90\n2025-04-01;110");
    await page
      .getByRole("button", { name: "Сохранить историю", exact: true })
      .click();
    await expect(page.getByLabel("График загруженной цены")).toBeVisible();
    await expect(
      page.locator(".metric").filter({ hasText: "Максимальная просадка" }),
    ).toContainText("-25%");
    await page.screenshot({
      path: join(root, ".local", "stocks-history.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const state = await page.evaluate(() => window.invest.load());
    expect(state.operations).toHaveLength(0);
    expect(state.instruments).toHaveLength(1);
    expect(state.instruments[0].stockAnalysis?.reports[0].netIncome).toBe(
      100000,
    );
    await page.reload();
    await navigate();
    await page
      .getByRole("button", { name: "Учебная акция", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Оценка стоимости", exact: true })
      .click();
    await expect(
      page.getByLabel("Нормализованный FCFE на акцию за год"),
    ).toHaveValue("10");
    await expect(
      page.getByText("Обратный DCF: 0% роста в год", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("реальная акция: три файла, статистика, 517 записей истории, дополнение и перезапуск", async () => {
  const root = resolve(".");
  const env = {
    ...process.env,
    INVEST_DATA_DIR: mkdtempSync(join(root, ".local", "equity-import-")),
    INVEST_TEST_MODE: "1",
  };
  delete (env as Record<string, string | undefined>).ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1060, 800),
    );
    const navigate = () =>
      page
        .getByRole("navigation")
        .getByRole("button", { name: "Акции", exact: true })
        .click();
    await navigate();
    await page
      .getByRole("button", { name: "Вставить из Aigenis", exact: true })
      .click();
    await page
      .getByLabel("Или выбрать файлы ответов (.json, .txt)")
      .setInputFiles(
        ["history", "stats", "card"].map((n) =>
          join(root, `tests/fixtures/aigenis-equity-${n}.json`),
        ),
      );
    await expect(page.getByLabel("JSON карточек акций")).toContainText("2299");
    await page
      .getByRole("button", { name: "Добавить акции", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Беларусбанк Ап17", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".stock-price-row")).toContainText("2");
    await expect(
      page.locator(".metric").filter({ hasText: "Сделок за 30 дней" }),
    ).toContainText("55");
    await expect(
      page.locator(".metric").filter({ hasText: "Оборот за 30 дней" }),
    ).toContainText(/3\s?609[,.]77/);
    await expect(page.locator(".stock-market-data")).toContainText(
      "517 записей",
    );
    await page.screenshot({
      path: join(root, ".local", "equity-real-summary.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "График и риск →", exact: true })
      .click();
    await expect(page.getByLabel("График загруженной цены")).toBeVisible();
    await expect(
      page.getByText(/средневзвешенная цена за торговый день/),
    ).toBeVisible();
    await expect(
      page.locator(".metric").filter({ hasText: "RSI Wilder" }),
    ).not.toContainText("—");
    await page.screenshot({
      path: join(root, ".local", "equity-real-history.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Вставить из Aigenis", exact: true })
      .click();
    await page
      .getByLabel("JSON карточек акций")
      .fill(readFileSync("tests/fixtures/aigenis-equity-stats.json", "utf8"));
    await page
      .getByRole("button", { name: "Добавить акции", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await navigate();
    await page
      .getByRole("button", { name: "Беларусбанк Ап17", exact: true })
      .click();
    const state = await page.evaluate(() => window.invest.load());
    expect(state.instruments).toHaveLength(1);
    expect(state.operations).toHaveLength(0);
    expect(state.instruments[0].stockAnalysis?.terminal?.trades).toHaveLength(
      517,
    );
    expect(state.instruments[0].stockAnalysis?.reports).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
