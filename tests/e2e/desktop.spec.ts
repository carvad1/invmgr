import { test, expect, _electron as electron } from "@playwright/test";
import { join, resolve } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
const root = resolve(".");
test("Windows desktop: вклад, выплата, анализ, журнал и перезапуск", async () => {
  mkdirSync(join(root, ".local"), { recursive: true });
  const dir = mkdtempSync(join(root, ".local", "e2e-"));
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
  try {
    await expect(
      page.getByRole("heading", { name: "Инвестиции под контролем" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(root, ".local", "overview-empty.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Добавить мой вклад" }).click();
    await page.getByLabel("Название", { exact: true }).fill("Мой вклад BYN");
    await page.getByLabel("Банк / площадка / счёт").fill("Мой банк");
    await page.getByLabel("Ставка, % годовых").fill("12");
    await page.getByLabel("Дата погашения / окончания").fill("2027-09-22");
    await page.getByLabel("Ближайшая дата выплаты").fill("2026-10-22");
    await page
      .getByRole("button", { name: "Сохранить и внести покупку" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Добавить операцию" }),
    ).toBeVisible();
    await page.getByLabel("Дата операции").fill("2026-01-01");
    await page.getByLabel("Сумма вклада / погашения, BYN").fill("10000");
    await page
      .getByLabel("Почему покупаю")
      .fill("Резерв на будущие расходы, фиксированная ставка.");
    await page.getByLabel("Цель", { exact: true }).fill("Накопить подушку");
    await page.getByRole("button", { name: "Сохранить операцию" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let state = await page.evaluate(() => window.invest.load());
    expect(state.operations).toHaveLength(2);
    expect(state.instruments).toHaveLength(1);
    await page.getByRole("button", { name: "Операция", exact: true }).click();
    await page.getByLabel("Операция", { exact: true }).selectOption("income");
    await page.getByLabel("Дата операции").fill("2026-09-01");
    await page.getByLabel("Сумма, BYN", { exact: true }).fill("800");
    await page.getByLabel("Комментарий").fill("Проценты по вкладу");
    await page.getByRole("button", { name: "Сохранить операцию" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({
      path: join(root, ".local", "overview-filled.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Мои активы" }).click();
    await expect(
      page.getByRole("heading", { name: "Мой вклад BYN" }),
    ).toBeVisible();
    await page.getByText("Причины покупок").click();
    await expect(
      page.getByText("Резерв на будущие расходы, фиксированная ставка."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Анализ", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "Доход и сценарии" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(root, ".local", "analysis.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Календарь выплат", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "Мой вклад BYN" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Операции", exact: true }).click();
    await expect(
      page.getByText("Проценты по вкладу", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByText("Ваши данные", { exact: true })).toBeVisible();
    state = await page.evaluate(() => window.invest.load());
    expect(state.operations).toHaveLength(3);
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({ args: [root], env });
    page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Инвестиции под контролем" }),
    ).toBeVisible();
    const restored = await page.evaluate(() => window.invest.load());
    expect(restored.operations).toHaveLength(3);
    expect(
      restored.operations.find((o) => o.kind === "buy")?.thesis.reason,
    ).toContain("Резерв");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  } catch (error) {
    console.log("Renderer errors:", errors);
    console.log(
      "Visible body:",
      (await page.locator("body").innerText()).slice(-7000),
    );
    await page.screenshot({
      path: join(root, ".local", "e2e-failure.png"),
      fullPage: true,
    });
    throw error;
  } finally {
    await app.close();
  }
});
