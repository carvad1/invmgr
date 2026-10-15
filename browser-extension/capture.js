(() => {
  "use strict";
  const origin = "https://invest.aigenis.by";
  const messageType = "invest-manager-aigenis-bond-v1";
  const object = (v) =>
    v && typeof v === "object" && !Array.isArray(v) ? v : null;
  const pick = (source, keys) =>
    Object.fromEntries(
      keys
        .filter(
          (key) =>
            source?.[key] !== undefined &&
            (source[key] === null ||
              ["string", "number", "boolean"].includes(typeof source[key])),
        )
        .map((key) => [key, source[key]]),
    );
  let latest = null;
  let generation = 0;
  let sequence = 0;
  let acceptedSequence = 0;
  let indexedDefinition = null;
  const cards = new Map();
  const extras = new Map();
  const extraSequences = new Map();
  window.addEventListener?.("hashchange", () => {
    generation++;
    latest = null;
    indexedDefinition = null;
    cards.clear();
    extras.clear();
    extraSequences.clear();
    window.postMessage(
      { type: messageType, data: { results: [] } },
      window.location.origin,
    );
  });

  function cleanEntry(value) {
    const item = object(value);
    const definition = object(item?.definition);
    if (
      !definition ||
      !["bond", "stock", "share", "equity"].includes(definition.product)
    )
      return null;
    const issuer = object(definition.issuer);
    const cleanDefinition = pick(definition, [
      "id",
      "product",
      "security_symbol",
      "state_security_id",
      "parent_symbol",
      "currency",
      "exchange",
      "min_price_increment",
      "issuer_unp",
      "issuer_country",
      "available_for_individuals",
      "available_for_legal_entities",
      "best_bid",
      "maturity_date",
      "coupon_rate",
      "nominal",
      "revenue_type",
      "last_deal_price",
      "calc_yield_last_deal",
      "accrued_interest_amount",
      "best_offer",
      "calc_yield_offer",
      "last_coupon_date",
      "next_coupon_date",
    ]);
    cleanDefinition.rating_level = pick(object(definition.rating_level), [
      "level_name",
    ]);
    cleanDefinition.issuer = {
      ...pick(issuer, ["full_name"]),
      rating_level: pick(object(issuer?.rating_level), ["level_name"]),
      issuer_group_data: pick(object(issuer?.issuer_group_data), [
        "message",
        "title",
      ]),
    };
    return {
      ...pick(item, [
        "id",
        "name_of_security",
        "trading_session_id",
        "settl_currency",
        "best_offer",
        "best_bid",
        "round_lot",
        "calc_yield_offer",
        "trading_status_updated_at",
        "isin",
        "cfi",
        "fisn",
        "symbol",
        "agreement_currency",
        "trading_status",
        "inactivity_period",
      ]),
      definition: cleanDefinition,
    };
  }

  function send() {
    const source = latest;
    if (!source) return;
    const selected = new Set(source.map((item) => String(item.definition.id)));
    const rows = [...cards.values()]
      .filter((item) => selected.has(String(item.row.definition.id)))
      .map((item) => item.row)
      .filter((item) => object(item.definition)?.id !== undefined);
    if (indexedDefinition !== null) {
      for (const item of rows) {
        if (item.definition.id === indexedDefinition)
          item.definition.revenue_type = "indexed";
      }
    }
    window.postMessage(
      {
        type: messageType,
        data: {
          results: rows,
          aigenis: Object.fromEntries(
            [...extras].filter(([id]) => selected.has(id)),
          ),
        },
        capturedAt: new Date().toISOString(),
      },
      window.location.origin,
    );
  }

  function accept(url, data, requestSequence) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url, window.location.href);
    } catch {
      return;
    }
    if (parsedUrl.origin !== origin) return;
    const detailMatch = parsedUrl.pathname.match(
      /^\/api\/v3\/definition\/details\/(\d+)\/$/,
    );
    const extraMatch = parsedUrl.pathname.match(
      /^\/api\/v1\/(trade_stat|definition_stat)\/$/,
    );
    if (detailMatch || extraMatch) {
      const definitionId =
        detailMatch?.[1] || parsedUrl.searchParams.get("definition");
      if (!definitionId || !/^\d+$/.test(definitionId)) return;
      const kind = detailMatch ? "details" : extraMatch[1];
      const sequenceKey = `${definitionId}:${kind}`;
      if (requestSequence < (extraSequences.get(sequenceKey) || 0)) return;
      let clean;
      if (kind === "details") {
        clean = {
          details: (Array.isArray(data?.details) ? data.details : [])
            .slice(0, 30)
            .map((block) => ({
              ...pick(block, ["block_name", "block_translated_name"]),
              block_data: (Array.isArray(block?.block_data)
                ? block.block_data
                : []
              )
                .slice(0, 100)
                .map((field) => pick(field, ["order", "name", "value"])),
            })),
        };
      } else {
        const rows = Array.isArray(data?.results) ? data.results : [];
        const keys =
          kind === "trade_stat"
            ? [
                "id",
                "security_definition",
                "trade_date",
                "avg_w_price",
                "min_price",
                "max_price",
                "trades_count",
                "volume",
              ]
            : [
                "id",
                "definition",
                "min_price_buy_orders_last_day",
                "max_price_buy_orders_last_day",
                "avg_w_price_buy_orders_last_day",
                "volume_buy_orders_last_day",
                "min_price_buy_orders_10days",
                "max_price_buy_orders_10days",
                "avg_w_price_buy_orders_10days",
                "avg_volume_buy_orders_10days",
                "min_price_sell_orders_last_day",
                "max_price_sell_orders_last_day",
                "avg_w_price_sell_orders_last_day",
                "volume_sell_orders_last_day",
                "min_price_sell_orders_10days",
                "max_price_sell_orders_10days",
                "avg_w_price_sell_orders_10days",
                "avg_volume_sell_orders_10days",
                "min_price_byn_last_day",
                "max_price_byn_last_day",
                "avg_w_price_byn_last_day",
                "num_deals_last_day",
                "total_size_last_day",
                "turnover_byn_last_day",
                "num_deals_last_10days",
                "num_deals_last_10days_rating_number",
                "min_price_byn_30days",
                "max_price_byn_30days",
                "avg_w_price_byn_30days",
                "num_deals_30days",
                "total_size_30days",
                "turnover_byn_30days",
              ];
        clean = {
          pagination: {
            count: Number(data?.pagination?.count) || rows.length,
            next: data?.pagination?.next === null ? null : "unknown-or-more",
          },
          results: rows.slice(0, 5000).map((row) => pick(row, keys)),
        };
      }
      if (!extras.has(definitionId) && extras.size >= 20) {
        const removed = extras.keys().next().value;
        extras.delete(removed);
        for (const key of extraSequences.keys())
          if (key.startsWith(`${removed}:`)) extraSequences.delete(key);
      }
      extraSequences.set(sequenceKey, requestSequence);
      extras.set(definitionId, { ...extras.get(definitionId), [kind]: clean });
      send();
      return;
    }
    if (/^\/api\/v1\/extended_definition\/?$/.test(parsedUrl.pathname)) {
      const result = Array.isArray(data?.results) ? data.results[0] : null;
      if (
        result?.revenue_type === "indexed" &&
        Number.isInteger(result.definition)
      ) {
        indexedDefinition = result.definition;
        send();
      }
      return;
    }
    if (
      !/^\/api\/v1\/security_definition\/(?:(?:\d+|equities)\/)?$/.test(
        parsedUrl.pathname,
      )
    )
      return;
    const list = Array.isArray(data?.results) ? data.results : [data];
    const clean = list.slice(0, 100).map(cleanEntry).filter(Boolean);
    for (const row of clean) {
      const key = `${row.definition.id}:${row.id ?? "definition"}`;
      if (!cards.has(key) && cards.size >= 200)
        cards.delete(cards.keys().next().value);
      if (requestSequence >= (cards.get(key)?.sequence || 0))
        cards.set(key, { row, sequence: requestSequence });
    }
    if (requestSequence < acceptedSequence) {
      send();
      return;
    }
    acceptedSequence = requestSequence;
    latest = clean;
    send();
  }

  const relevant = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      return (
        parsed.origin === origin &&
        /^\/api\/(?:v1\/(?:security_definition|extended_definition|trade_stat|definition_stat)\/|v3\/definition\/details\/\d+\/)/.test(
          parsed.pathname,
        )
      );
    } catch {
      return false;
    }
  };

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
    const requestGeneration = generation,
      requestSequence = ++sequence;
    const method = args[1]?.method || args[0]?.method || "GET";
    return originalFetch.apply(this, args).then((response) => {
      if (
        String(method).toUpperCase() === "GET" &&
        response.ok !== false &&
        requestUrl &&
        relevant(requestUrl)
      )
        response
          .clone()
          .json()
          .then((data) => {
            if (requestGeneration === generation)
              accept(requestUrl, data, requestSequence);
          })
          .catch(() => {});
      return response;
    });
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(method).toUpperCase() === "GET" && relevant(url)) {
      const requestGeneration = generation,
        requestSequence = ++sequence;
      this.addEventListener(
        "load",
        () => {
          if (
            this.status < 200 ||
            this.status >= 300 ||
            requestGeneration !== generation
          )
            return;
          try {
            accept(
              url,
              this.responseType === "json"
                ? this.response
                : JSON.parse(this.responseText),
              requestSequence,
            );
          } catch {
            /* Other response types are ignored. */
          }
        },
        { once: true },
      );
    }
    return originalOpen.call(this, method, url, ...rest);
  };
})();
