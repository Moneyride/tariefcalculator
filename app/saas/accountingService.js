(function initializeAccountingService() {
  "use strict";

  const supabase = globalThis.OveruurtjeSupabase;
  const config = globalThis.OveruurtjeConfig;
  const functionName = "accounting-moneybird";

  async function clientAndSession() {
    const client = await supabase.getClient();
    if (!client) throw new Error("Supabase is niet geconfigureerd.");
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("Log opnieuw in om Moneybird te gebruiken.");
    return { client, session: data.session };
  }

  async function invoke(action, payload = {}) {
    const { session } = await clientAndSession();
    const response = await fetch(`${config.supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Moneybird kon de actie niet uitvoeren.");
    return result;
  }

  async function mappings(table) {
    const { client } = await clientAndSession();
    const { data, error } = await client.from(table).select("*");
    if (error) throw error;
    return data || [];
  }

  async function saveMapping(table, record, conflict) {
    const { client, session } = await clientAndSession();
    const { data, error } = await client.from(table).upsert({ user_id: session.user.id, ...record }, {
      onConflict: conflict
    }).select().single();
    if (error) throw error;
    return data;
  }

  globalThis.OveruurtjeAccounting = Object.freeze({
    status: () => invoke("status"),
    startOAuth: () => invoke("startOAuth"),
    connectDevelopment: () => invoke("connectDevelopment"),
    administrations: () => invoke("administrations"),
    selectAdministration: (administrationId) => invoke("selectAdministration", { administrationId }),
    validate: () => invoke("validate"),
    disconnect: () => invoke("disconnect"),
    contacts: (query = "") => invoke("contacts", { query }),
    configurationOptions: () => invoke("configurationOptions"),
    createDraftInvoice: (payload) => invoke("createDraftInvoice", payload),
    exports: () => invoke("exports"),
    customerMappings: () => mappings("accounting_customer_mappings"),
    taxMappings: () => mappings("accounting_tax_mappings"),
    ledgerMappings: () => mappings("accounting_ledger_mappings"),
    saveCustomerMapping: (record) => saveMapping("accounting_customer_mappings", record, "connection_id,local_customer_key"),
    saveTaxMapping: (record) => saveMapping("accounting_tax_mappings", record, "connection_id,local_tax_percentage"),
    saveLedgerMapping: (record) => saveMapping("accounting_ledger_mappings", record, "connection_id,category")
  });
})();
