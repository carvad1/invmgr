import { describe, expect, it } from "vitest";
import { instrument } from "./helpers";
import {
  assessDebt,
  blankResearch,
  catalogInstrument,
  debtScenario,
} from "../src/domain/research";
import { inspectSource } from "../electron/sources";
import {
  parseAigenisBonds,
  parseFinstoreIssue,
  publishedRating,
} from "../electron/research-source";
import { instrumentSchema } from "../src/domain/validation";
import { paymentSchedule } from "../src/domain/finance";

const fin = `<h1 class="smart__title">Компания Тест</h1><div class="smart"><span class="smart-percent">7,5%</span><a class="white-paper" href="/upload/test.pdf">White Paper</a></div>
<div class="token-information__it"><span>Валюта</span><span>USD</span></div>
<div class="token-information__it"><span>Стоимость</span><span>20 USD</span></div>
<div class="token-information__it"><span>Период обращения</span><span>01.01.2026 - 01.01.2029</span></div>
<div class="token-information__it"><span>Периодичность выплат</span><span>Ежемесячно</span></div>
<div class="tokens-grid__el"><span class="tokens-el__status">Кредитный рейтинг компании by.A+</span><a href="/kupit-tokeny/999">Подробнее</a></div>
<div class="tokens-grid__el"><span class="tokens-el__status">Компании присвоен рейтинг деловой репутации by.А reputation</span><a href="/kupit-tokeny/123">Подробнее</a></div>`;
const bonds = (
  indexed = true,
) => `<div class="wp-block-aigenis-bounds" data-code="55 выпуск" data-reg="TEST55" data-curency="${indexed ? "USD" : "BYN"}" data-vterm="апрель 2034">
<h5>Номинал</h5><p>300 BYN</p><h4>График выплаты</h4><p>6,5% годовых, 1 раз в квартал</p>
<p class="bounds-years">2026 <sub>(04.12)</sub><br>2027 <sub>(04.03, 04.06)</sub></p>
<div class="bounds-footer"><a href="https://aigenis.by/test.pdf">Проспект</a></div></div>`;

describe("Быстрый разбор источников", () => {
  it("привязывает рейтинг только к выбранному выпуску и различает его тип", () => {
    const item = parseFinstoreIssue(
      fin,
      "https://finstore.by/kupit-tokeny/123",
    )[0];
    expect(item).toMatchObject({
      rate: 7.5,
      nominal: 20,
      frequency: 12,
      maturity: "2029-01-01",
    });
    expect(item.research?.rating).toMatchObject({
      value: "by.А reputation",
      kind: "reputation",
    });
    expect(item.research?.documents[0].url).toBe(
      "https://finstore.by/upload/test.pdf",
    );
    expect(
      publishedRating("Кредитный рейтинг компании by.A+", item.sourceUrl)?.kind,
    ).toBe("credit");
    expect(
      parseFinstoreIssue(fin, "https://finstore.by/kupit-tokeny/456")[0]
        .research?.rating,
    ).toBeUndefined();
  });
  it("сохраняет валюту номинала BYN у индексируемой облигации, не придумывает дату погашения", () => {
    const item = parseAigenisBonds(bonds())[0];
    expect(item).toMatchObject({
      currency: "BYN",
      nominal: 300,
      rate: 6.5,
      maturity: "",
      frequency: 4,
    });
    expect(item.research?.rateModel).toBe("indexed");
    expect(item.research?.paymentDates).toEqual([
      "2026-12-04",
      "2027-03-04",
      "2027-06-04",
    ]);
    expect(item.research?.rating).toBeUndefined();
    expect(instrumentSchema.parse(catalogInstrument(item)).research).toEqual(
      item.research,
    );
  });
  it("отклоняет нераспознанную страницу и неподдерживаемые URL до запроса", async () => {
    await expect(
      inspectSource("https://aigenis.by/bonds/", async () => "captcha"),
    ).rejects.toThrow("не распознаны");
    for (const url of [
      "https://aigenis.by.evil.test/bonds/",
      "https://127.0.0.1/",
      "file:///test",
      "https://app.finstore.by/auth",
    ]) {
      let called = false;
      await expect(
        inspectSource(url, async () => {
          called = true;
          return fin;
        }),
      ).rejects.toThrow();
      expect(called).toBe(false);
    }
  });
  it("выбирает точный выпуск Aigenis из общей страницы", async () => {
    const result = await inspectSource(
      "https://aigenis.by/bonds/#TEST55",
      async () => bonds(false),
    );
    expect(result).toHaveLength(1);
    expect(result[0].research?.issueId).toBe("TEST55");
  });
});

describe("Доходность и оценка выпуска", () => {
  it("покупает целые единицы, учитывает комиссию и не включает остаток в знаменатель", () => {
    const i = instrument({
      kind: "bond",
      nominal: 100,
      annualRate: 10,
      maturity: "2030-01-01",
    });
    const s = debtScenario(i, 1000, 100, 10, 365, "2026-09-23");
    expect(s.quantity).toBe(9);
    expect(s.invested).toBe(910);
    expect(s.unspent).toBe(90);
    expect(s.interest).toBe(80);
    expect(s.returnPercent).toBeCloseTo((80 / 910) * 100, 10);
    expect(s.currentYield).toBe(10);
    expect(debtScenario(i, 50, 100, 0, 365).returnPercent).toBeNull();
    expect(debtScenario(i, 1000, 0, 0, 365).returnPercent).toBeNull();
    expect(debtScenario(i, 1000, 100, 2000, 365).returnPercent).toBeNull();
  });
  it("ограничивает горизонт погашением и не показывает доход после него", () => {
    const i = instrument({ kind: "bond", maturity: "2026-10-03" });
    expect(debtScenario(i, 1000, 100, 0, 365, "2026-09-23").horizon).toBe(10);
    expect(
      debtScenario(i, 1000, 100, 0, 365, "2026-10-03").returnPercent,
    ).toBeNull();
  });
  it("не превращает индексацию или неизвестную ставку в фиксированный прогноз", () => {
    const i = catalogInstrument(parseAigenisBonds(bonds())[0]);
    i.maturity = "2034-04-01";
    expect(debtScenario(i, 1000, 300, 0, 365).interest).toBeNull();
    expect(paymentSchedule(i, 3)).toEqual([]);
    i.research!.rateModel = "unknown";
    i.research!.rateKnown = false;
    expect(debtScenario(i, 1000, 300, 0, 365).returnPercent).toBeNull();
  });
  it("не считает высокий рейтинг и неизвестные выплаты подтверждением безопасности", () => {
    const i = catalogInstrument(
      parseFinstoreIssue(fin, "https://finstore.by/kupit-tokeny/123")[0],
    );
    expect(assessDebt(i).tone).toBe("unknown");
    i.research!.paymentStatus = "late";
    expect(assessDebt(i).tone).toBe("danger");
    i.research!.paymentStatus = "unknown";
    i.equity = 0;
    expect(assessDebt(i).tone).toBe("danger");
  });
  it("учитывает давность отчётности и проверки выплат, показывает факторы риска", () => {
    const i = instrument({
      kind: "bond",
      maturity: "2030-01-01",
      reportDate: "2025-12-31",
      equity: 100,
      debt: 150,
      netIncome: 20,
      research: {
        ...blankResearch("test", "Тест"),
        nominalKnown: true,
        rateKnown: true,
        security: "Нет обеспечения",
        paymentStatus: "current",
        statusDate: "2026-09-20",
        statusSource: "https://finstore.by/blog/report",
      },
    });
    expect(assessDebt(i, "2026-09-23").tone).toBe("checked");
    i.debt = 400;
    expect(assessDebt(i, "2026-09-23").tone).toBe("warning");
    i.debt = 150;
    expect(assessDebt(i, "2028-09-23").tone).toBe("unknown");
    i.reportDate = "2029-01-01";
    expect(assessDebt(i, "2026-09-23").reportFresh).toBe(false);
  });
  it("сохраняет неизвестные сведения и проверяет основание отметки о выплатах", () => {
    const i = instrument({ research: blankResearch("test", "Тест") });
    expect(instrumentSchema.parse(i).research?.paymentStatus).toBe("unknown");
    i.research!.paymentStatus = "current";
    expect(() => instrumentSchema.parse(i)).toThrow("источник");
  });
});
