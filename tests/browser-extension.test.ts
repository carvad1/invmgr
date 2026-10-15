import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importStockResponses } from "../src/domain/stock-import";

describe("расширение Aigenis", () => {
  it("кнопка копирует историю вместе с карточкой одной акции", async () => {
    const fixture=(n:string)=>JSON.parse(readFileSync(`tests/fixtures/aigenis-equity-${n}.json`,"utf8").replace(/^\uFEFF/,""));
    const payload={...fixture("card"),aigenis:{1113:{trade_stat:fixture("history"),definition_stat:fixture("stats")}}};
    let listener:any,click:any,copied="";
    const w={location:{origin:"https://web.aigenis.by"},addEventListener:(_e:string,fn:any)=>{listener=fn;}};
    const button:any={style:{},addEventListener:(_e:string,fn:any)=>{click=fn;}};
    const document={readyState:"complete",getElementById:()=>null,createElement:()=>button,body:{appendChild:()=>{}}};
    const navigator={clipboard:{writeText:async(s:string)=>{copied=s;}}};
    new Function("window","document","navigator","setTimeout",readFileSync("browser-extension/button.js","utf8"))(w,document,navigator,()=>{});
    listener({source:w,origin:w.location.origin,data:{type:"invest-manager-aigenis-bond-v1",data:payload,capturedAt:new Date().toISOString()}});
    expect(button.textContent).toBe("Скопировать акцию");expect(button.title).toContain("517");
    await click();expect(JSON.parse(copied).aigenis[1113].trade_stat.results).toHaveLength(517);
  });
  it.each([false, true])(
    "собирает реальные карточки, историю и статистику (дополнения первыми: %s)",
    async (extrasFirst) => {
      const fixture = (name: string) =>
        JSON.parse(
          readFileSync(
            `tests/fixtures/aigenis-equity-${name}.json`,
            "utf8",
          ).replace(/^\uFEFF/, ""),
        );
      const card = fixture("card"),
        history = fixture("history"),
        stats = fixture("stats"),
        messages: any[] = [];
      const base = "https://invest.aigenis.by/api/";
      const responses = new Map([
        [base + "v1/security_definition/?definition=1113", card],
        [base + "v1/security_definition/2299/", card.results[0]],
        [base + "v1/trade_stat/?definition=1113&page_size=1000", history],
        [base + "v1/definition_stat/?definition=1113", stats],
        [
          base + "v3/definition/details/1113/",
          {
            details: [
              {
                block_translated_name: "Основные",
                block_data: [
                  {
                    name: "Тип",
                    value: "Привилегированная",
                    authorization: "secret",
                  },
                ],
              },
            ],
          },
        ],
      ]);
      const w = {
        location: {
          href: "https://web.aigenis.by/",
          origin: "https://web.aigenis.by",
        },
        postMessage: (m: any) => messages.push(m),
        fetch: async (url: string) => ({
          clone: () => ({ json: async () => responses.get(url) }),
        }),
      };
      class XHR {
        open() {}
        addEventListener() {}
      }
      new Function(
        "window",
        "XMLHttpRequest",
        readFileSync("browser-extension/capture.js", "utf8"),
      )(w, XHR);
      const urls = [...responses.keys()];
      for (const url of extrasFirst
        ? [...urls.slice(2), ...urls.slice(0, 2)]
        : urls) {
        await w.fetch(url);
        await new Promise((r) => setTimeout(r, 0));
      }
      const payload = messages.at(-1).data;
      expect(payload.results).toHaveLength(2);
      expect(payload.aigenis[1113].trade_stat.results).toHaveLength(517);
      expect(JSON.stringify(payload)).not.toContain("secret");
      expect(
        importStockResponses(JSON.stringify(payload), []).instruments[0]
          .stockAnalysis?.terminal?.stats.turnover_byn_30days,
      ).toBe(3609.77);
      // Supplemental responses for another definition must not replace the visible card.
      responses.set(base + "v1/definition_stat/?definition=1114", {
        results: [{ definition: 1114, num_deals_30days: 9 }],
      });
      await w.fetch(base + "v1/definition_stat/?definition=1114");
      await new Promise((r) => setTimeout(r, 0));
      expect(Object.keys(messages.at(-1).data.aigenis)).toEqual(["1113"]);
    },
  );
  it("переключается с облигации на акцию, очищает старую карточку и игнорирует запоздалый ответ", async () => {
    const messages: any[] = [];
    const listeners = new Map<string, () => void>();
    let release: (v: unknown) => void = () => {};
    const base = "https://invest.aigenis.by/api/v1/security_definition/";
    const fakeWindow = {
      location: {
        href: "https://web.aigenis.by/#/ru/bcse/trades/bonds",
        origin: "https://web.aigenis.by",
      },
      postMessage: (m: unknown) => messages.push(m),
      addEventListener: (event: string, fn: () => void) =>
        listeners.set(event, fn),
      fetch: async (url: string) => ({
        clone: () => ({
          json: async () =>
            url.endsWith("1/")
              ? new Promise((r) => {
                  release = r;
                })
              : {
                  results: [
                    {
                      best_bid: 95,
                      best_offer: 100,
                      round_lot: 1,
                      definition: {
                        id: 2,
                        product: "stock",
                        security_symbol: "TEST",
                        currency: "BYN",
                        last_deal_price: 98,
                        issuer: { full_name: "Компания" },
                      },
                      cookie: "secret",
                    },
                  ],
                },
        }),
      }),
    };
    class XHR {
      open() {}
      addEventListener() {}
    }
    new Function(
      "window",
      "XMLHttpRequest",
      readFileSync(
        join(process.cwd(), "browser-extension", "capture.js"),
        "utf8",
      ),
    )(fakeWindow, XHR);
    await fakeWindow.fetch(base + "1/");
    await fakeWindow.fetch(base + "?definition=2");
    await new Promise((r) => setTimeout(r, 0));
    expect(messages.at(-1).data.results[0]).toMatchObject({
      best_bid: 95,
      best_offer: 100,
      round_lot: 1,
      definition: { product: "stock" },
    });
    release({ definition: { id: 1, product: "bond" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(messages.at(-1).data.results[0].definition.product).toBe("stock");
    expect(JSON.stringify(messages)).not.toContain("secret");
    listeners.get("hashchange")!();
    expect(messages.at(-1).data.results).toEqual([]);
  });
  it("копирует только поля облигации и учитывает индексацию", async () => {
    const messages: unknown[] = [];
    const responses = new Map<string, unknown>([
      [
        "https://invest.aigenis.by/api/v1/security_definition/25077/",
        {
          id: 25077,
          name_of_security: "ТуровМолКомб Оп5",
          best_offer: 0,
          definition: {
            id: 1757,
            product: "bond",
            security_symbol: "BY4000403559",
            coupon_rate: 10,
            calc_yield_last_deal: 5.01,
            revenue_type: "percent",
            issuer: {
              full_name: "Эмитент",
              issuer_group_data: { message: "Есть случаи неисполнения" },
            },
            secret: "must-not-copy",
          },
          authorization: "JWT must-not-copy",
        },
      ],
      [
        "https://invest.aigenis.by/api/v1/extended_definition/?definition=1757",
        {
          results: [{ definition: 1757, revenue_type: "indexed" }],
        },
      ],
    ]);
    const fakeWindow = {
      location: {
        href: "https://web.aigenis.by/#/ru/bcse/trades/bonds",
        origin: "https://web.aigenis.by",
      },
      postMessage: (message: unknown) => messages.push(message),
      fetch: async (url: string) => ({
        clone: () => ({ json: async () => responses.get(url) }),
      }),
    };
    class FakeXHR {
      open() {}
      addEventListener() {}
    }
    const source = readFileSync(
      join(process.cwd(), "browser-extension", "capture.js"),
      "utf8",
    );
    new Function("window", "XMLHttpRequest", source)(fakeWindow, FakeXHR);
    await fakeWindow.fetch(
      "https://invest.aigenis.by/api/v1/security_definition/25077/",
    );
    await fakeWindow.fetch(
      "https://invest.aigenis.by/api/v1/extended_definition/?definition=1757",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const latest = messages.at(-1) as {
      data: { results: [{ definition: { revenue_type: string } }] };
    };
    expect(latest.data.results[0].definition.revenue_type).toBe("indexed");
    expect(JSON.stringify(latest)).not.toContain("must-not-copy");
  });
});
