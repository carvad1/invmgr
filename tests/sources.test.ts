import { describe, expect, it } from "vitest";
import {
  parseAigenis,
  parseFinstore,
  parseNbrb,
  safeSourceUrl,
} from "../electron/sources";
describe("Открытые источники", () => {
  it("Finstore отличает ставку от цены и валюты", () => {
    const items = parseFinstore(
      '<div class="tokens-grid__el"><span class="tokens-el__title-text">Тест</span><div class="tokens-el__rate">7.70% годовых</div><div>Срок 60 месяцев Цена 20 USD</div><a href="/kupit-tokeny/123">Подробнее</a></div>',
    );
    expect(items[0]).toMatchObject({
      name: "Тест",
      price: 20,
      rate: 7.7,
      currency: "USD",
      termMonths: 60,
    });
    expect(items[0].priceDate).toBe("");
  });
  it("не интерпретирует номинал Aigenis как рыночную цену", () => {
    const items = parseAigenis(
      '<div class="paper-card"><h4>Облигация</h4><p class="base-price-currency">1000 USD</p><p class="base-price-header">Ставка дохода:</p><p>7,625%</p></div>',
    );
    expect(items[0].priceLabel).toContain("не рыночная");
    expect(items[0].rate).toBe(7.625);
  });
  it("изменившаяся разметка не генерирует фиктивные данные", () => {
    expect(parseFinstore("<p>captcha</p>")).toEqual([]);
    expect(parseAigenis("")).toEqual([]);
  });
  it("делит курс RUB на масштаб 100", () => {
    const rows = ["USD", "EUR", "RUB"].map((c, i) => ({
      Cur_Abbreviation: c,
      Cur_OfficialRate: i === 2 ? 3.5 : 3,
      Cur_Scale: i === 2 ? 100 : 1,
      Date: "2025-01-01T00:00:00",
    }));
    expect(
      parseNbrb(JSON.stringify(rows)).find((r) => r.currency === "RUB")?.rate,
    ).toBe(0.035);
  });
  it("отклоняет неполный ответ курсов", () =>
    expect(() => parseNbrb("[]")).toThrow());
  it("ссылки допускают только официальные https-источники", () => {
    expect(safeSourceUrl("https://finstore.by/kupit-tokeny/123")).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "file:///C:/Windows/",
      "https://finstore.by.evil.com",
      "https://evil.com",
      "https://user@finstore.by",
      "https://finstore.by:8888",
    ])
      expect(safeSourceUrl(url)).toBe(false);
  });
});
