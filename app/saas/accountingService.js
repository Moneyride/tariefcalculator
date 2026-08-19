(function initializeAccountingService() {
  "use strict";

  const supabase = globalThis.OveruurtjeSupabase;
  const config = globalThis.OveruurtjeConfig;
  const functionName = "accounting-moneybird";
  const responseCache = new Map();
  const pendingRequests = new Map();
  const cacheLimits = Object.freeze({ maxEntries: 80 });

  function cacheKey(action, payload) {
    return `${action}:${JSON.stringify(payload || {})}`;
  }

  function pruneCache() {
    const now = Date.now();
    for (const [key, entry] of responseCache) {
      if (entry.expiresAt <= now) responseCache.delete(key);
    }
    while (responseCache.size > cacheLimits.maxEntries) {
      responseCache.delete(responseCache.keys().next().value);
    }
  }

  function invalidate(...actions) {
    for (const key of responseCache.keys()) {
      if (!actions.length || actions.some((action) => key.startsWith(`${action}:`))) responseCache.delete(key);
    }
  }

  async function clientAndSession() {
    const client = await supabase.getClient();
    if (!client) throw new Error("Supabase is niet geconfigureerd.");
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("Log opnieuw in om Moneybird te gebruiken.");
    return { client, session: data.session };
  }

  async function request(action, payload = {}) {
    const { session } = await clientAndSession();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`${config.supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("De Moneybird-koppeling reageert niet. Probeer het opnieuw.");
      }
      throw new Error("De Moneybird-koppeling kon niet worden bereikt.");
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Moneybird kon de actie niet uitvoeren.");
    return result;
  }

  function invoke(action, payload = {}, options = {}) {
    const key = cacheKey(action, payload);
    const ttl = Math.max(0, Number(options.cacheTtlMs) || 0);
    pruneCache();
    const cached = responseCache.get(key);
    if (ttl && cached?.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (pendingRequests.has(key)) return pendingRequests.get(key);

    const pending = request(action, payload).then((result) => {
      if (ttl) responseCache.set(key, { value: result, expiresAt: Date.now() + ttl });
      return result;
    }).finally(() => pendingRequests.delete(key));
    pendingRequests.set(key, pending);
    return pending;
  }

  async function mappings(table) {
    const key = `mapping:${table}`;
    pruneCache();
    const cached = responseCache.get(key);
    if (cached?.expiresAt > Date.now()) return cached.value;
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    const pending = loadMappings(table).finally(() => pendingRequests.delete(key));
    pendingRequests.set(key, pending);
    return pending;
  }

  async function loadMappings(table) {
    const { client } = await clientAndSession();
    const { data, error } = await client.from(table).select("*").limit(500);
    if (error) throw error;
    const result = data || [];
    responseCache.set(`mapping:${table}`, { value: result, expiresAt: Date.now() + 30000 });
    return result;
  }

  async function saveMapping(table, record, conflict) {
    const { client, session } = await clientAndSession();
    const { data, error } = await client.from(table).upsert({ user_id: session.user.id, ...record }, {
      onConflict: conflict
    }).select().single();
    if (error) throw error;
    responseCache.delete(`mapping:${table}`);
    return data;
  }

  globalThis.OveruurtjeAccounting = Object.freeze({
    status: () => invoke("status", {}, { cacheTtlMs: 15000 }),
    startOAuth: () => invoke("startOAuth"),
    connectDevelopment: async () => {
      const result = await invoke("connectDevelopment");
      invalidate();
      return result;
    },
    administrations: () => invoke("administrations", {}, { cacheTtlMs: 5 * 60 * 1000 }),
    settingsBootstrap: () => invoke("settingsBootstrap", {}, { cacheTtlMs: 15000 }),
    selectAdministration: async (administrationId) => {
      const result = await invoke("selectAdministration", { administrationId });
      invalidate();
      return result;
    },
    validate: () => invoke("validate"),
    disconnect: async () => {
      const result = await invoke("disconnect");
      invalidate();
      return result;
    },
    contacts: (query = "") => invoke("contacts", { query: query.trim() }, { cacheTtlMs: 2 * 60 * 1000 }),
    configurationOptions: () => invoke("configurationOptions", {}, { cacheTtlMs: 30 * 60 * 1000 }),
    previewBootstrap: () => invoke("previewBootstrap"),
    createDraftInvoice: async (payload) => {
      const result = await invoke("createDraftInvoice", payload);
      invalidate("exports", "previewBootstrap");
      return result;
    },
    exports: () => invoke("exports", {}, { cacheTtlMs: 15000 }),
    customerMappings: () => mappings("accounting_customer_mappings"),
    taxMappings: () => mappings("accounting_tax_mappings"),
    ledgerMappings: () => mappings("accounting_ledger_mappings"),
    saveCustomerMapping: (record) => saveMapping("accounting_customer_mappings", record, "connection_id,local_customer_key"),
    saveTaxMapping: (record) => saveMapping("accounting_tax_mappings", record, "connection_id,local_tax_percentage"),
    saveLedgerMapping: (record) => saveMapping("accounting_ledger_mappings", record, "connection_id,category")
  });
})();
