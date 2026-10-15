import { describe, expect, it } from "vitest";
import { bondAnalysis, parseTerminalBonds } from "../src/domain/bond-screener";

describe("быстрый просмотр облигаций", () => {
  it("не выдаёт доходность прошлой сделки за доступную доходность покупки", () => {
    const raw = JSON.stringify({
      results: [
        {
          id: 25081,
          trading_session_id: "NDA",
          best_offer: 0,
          trading_status_updated_at: "2026-09-25T12:48:58",
          definition: {
            product: "bond",
            security_symbol: "BY4000403559",
            parent_symbol: "ТуровМолКомб Оп5",
            currency: "BYN",
            coupon_rate: 10,
            last_deal_price: 3786,
            calc_yield_last_deal: 5.0137,
            revenue_type: "indexed",
            rating_level: { level_name: "Без рейтинга" },
            issuer: {
              full_name: "Туровский молочный комбинат",
              issuer_group_data: {
                message: "Были случаи неисполнения обязательств",
              },
            },
          },
        },
        {
          id: 25077,
          trading_session_id: "REPO",
          best_offer: 0,
          definition: {
            product: "bond",
            security_symbol: "BY4000403559",
            coupon_rate: 10,
          },
        },
      ],
    });
    const rows = parseTerminalBonds(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      coupon: 10,
      purchaseYield: null,
      historicalYield: 5.0137,
      rating: "Без рейтинга",
      indexed: true,
    });
    expect(rows[0].warning).toContain("неисполнения");
    expect(bondAnalysis(rows[0])).toEqual({
      price: 3786,
      yield: 5.0137,
      source: "last",
    });
  });
  it("отклоняет заголовки вместо JSON", () => {
    expect(() => parseTerminalBonds("Authorization: JWT secret")).toThrow(
      /JSON/,
    );
  });
  const read = (
    definition: Record<string, unknown> = {},
    fields: Record<string, unknown> = {},
  ) =>
    parseTerminalBonds(
      JSON.stringify({
        best_offer: 0,
        ...fields,
        definition: {
          product: "bond",
          security_symbol: "TEST",
          currency: "BYN",
          last_deal_price: 98,
          calc_yield_last_deal: 15,
          ...definition,
        },
      }),
    )[0];
  it.each([0, null, undefined])(
    "использует последнюю цену при отсутствии заявки (%s)",
    (offer) => {
      expect(bondAnalysis(read({}, { best_offer: offer }))).toEqual({
        price: 98,
        yield: 15,
        source: "last",
      });
    },
  );
  it("предпочитает цену и доходность заявки исторической сделке", () => {
    expect(
      bondAnalysis(read({}, { best_offer: 102, calc_yield_offer: 11 })),
    ).toEqual({ price: 102, yield: 11, source: "offer" });
  });
  it("не смешивает цену заявки с доходностью прошлой сделки", () => {
    expect(bondAnalysis(read({}, { best_offer: 102 }))).toEqual({
      price: 102,
      yield: null,
      source: "offer",
    });
  });
  it("берёт цену и доходность из одного уровня ответа, игнорируя нули пустого режима", () => {
    expect(
      bondAnalysis(
        read(
          { best_offer: 102, calc_yield_offer: 11 },
          { best_offer: 0, calc_yield_offer: 0 },
        ),
      ),
    ).toEqual({ price: 102, yield: 11, source: "offer" });
    expect(
      bondAnalysis(
        read({ best_offer: 102, calc_yield_offer: 11 }, { best_offer: 103 }),
      ),
    ).toEqual({ price: 103, yield: null, source: "offer" });
  });
  it.each([0, -2.5])(
    "сохраняет нулевую и отрицательную доходность (%s)",
    (value) => {
      expect(bondAnalysis(read({ calc_yield_last_deal: value }))).toEqual({
        price: 98,
        yield: value,
        source: "last",
      });
    },
  );
  it("не придумывает доходность, если передана только цена", () => {
    expect(bondAnalysis(read({ calc_yield_last_deal: null }))).toEqual({
      price: 98,
      yield: null,
      source: "last",
    });
  });
  it("без цены оставляет анализ недоступным даже при наличии исторической доходности", () => {
    expect(bondAnalysis(read({ last_deal_price: 0 }))).toEqual({
      price: null,
      yield: null,
      source: null,
    });
  });
  it("не применяет правило вставки к открытому каталогу", () => {
    const row = { ...read(), source: "catalog" as const };
    expect(bondAnalysis(row)).toEqual({
      price: null,
      yield: null,
      source: null,
    });
  });
});
