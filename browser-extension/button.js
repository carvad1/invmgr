(() => {
  "use strict";
  const messageType = "invest-manager-aigenis-bond-v1";
  let payload = null;
  let capturedAt = "";
  let button;
  const label = () => {
    if (!payload) return "Откройте акцию или облигацию";
    const stocks = payload.results.every((r) =>
      ["stock", "share", "equity"].includes(r.definition?.product),
    );
    const bonds = payload.results.every(
      (r) => r.definition?.product === "bond",
    );
    if (new Set(payload.results.map((r) => r.definition?.id)).size === 1)
      return stocks ? "Скопировать акцию" : "Скопировать облигацию";
    return `Скопировать ${stocks ? "акции" : bonds ? "облигации" : "бумаги"} (${payload.results.length})`;
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.type !== messageType
    )
      return;
    const results = event.data?.data?.results;
    if (!Array.isArray(results)) return;
    payload =
      results.length && results.length <= 200
        ? { results, aigenis: event.data.data.aigenis }
        : null;
    capturedAt = String(event.data.capturedAt || "");
    if (button) {
      button.textContent = label();
      const extra = Object.values(payload?.aigenis || {});
      const count = extra.reduce(
        (n, e) => n + (e.trade_stat?.results?.length || 0),
        0,
      );
      button.title = `Карточка${count ? ` · история: ${count} записей` : " · история ещё не получена"}${extra.some((e) => e.definition_stat) ? " · статистика торгов" : ""}. Вставьте в Invest Manager → Акции.`;
    }
  });

  async function copy() {
    if (!payload) {
      button.textContent = label();
      return;
    }
    const json = JSON.stringify({ ...payload, capturedAt }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const area = document.createElement("textarea");
      area.value = json;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand("copy");
      area.remove();
      if (!success) {
        button.textContent = "Не удалось скопировать";
        return;
      }
    }
    button.textContent = "Скопировано для Invest Manager";
    button.title = `Данные получены ${capturedAt}. В Invest Manager откройте Акции или Анализ → Вставить из Aigenis.`;
    setTimeout(() => {
      if (button) button.textContent = label();
    }, 3500);
  }

  function mount() {
    if (document.getElementById("invest-manager-copy-bond")) return;
    button = document.createElement("button");
    button.id = "invest-manager-copy-bond";
    button.type = "button";
    button.textContent = label();
    button.title =
      "После открытия карточки скопируйте её данные для Invest Manager";
    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      background: "#126f67",
      color: "white",
      border: "0",
      borderRadius: "10px",
      padding: "12px 16px",
      font: "600 14px system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 16px #0004",
    });
    button.addEventListener("click", copy);
    document.body.appendChild(button);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
