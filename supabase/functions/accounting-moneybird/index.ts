import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const clientId = Deno.env.get("MONEYBIRD_CLIENT_ID") || "";
const clientSecret = Deno.env.get("MONEYBIRD_CLIENT_SECRET") || "";
const redirectUri = Deno.env.get("MONEYBIRD_REDIRECT_URI") || "";
const appUrl = (Deno.env.get("OVERUURTJE_APP_URL") || "https://overuurtje.nl").replace(/\/$/, "");
const encryptionSecret = Deno.env.get("ACCOUNTING_TOKEN_ENCRYPTION_KEY") || "";
const developmentPat = Deno.env.get("MONEYBIRD_DEVELOPMENT_PAT") || "";
const allowDevelopmentPat = Deno.env.get("MONEYBIRD_ALLOW_DEVELOPMENT_PAT") === "true";

const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

type Credentials = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string | null;
};

type ExportLine = {
  category: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  vatPercentage: number;
};

type ExportModel = {
  sourceType: "workday" | "project";
  sourceId: string;
  sourceItems: Array<{ sourceType: "workday" | "project_day"; sourceId: string }>;
  date: string;
  customer: { localKey: string; name: string; externalContactId?: string };
  project?: { id?: string; name?: string };
  reference: string;
  lineItems: ExportLine[];
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function redirect(path: string) {
  return Response.redirect(`${appUrl}${path.startsWith("/") ? path : `/${path}`}`, 302);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  if (!encryptionSecret) throw new Error("ACCOUNTING_TOKEN_ENCRYPTION_KEY ontbreekt.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionSecret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredentials(credentials: Credentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(credentials))
  );
  return {
    encryptedCredentials: bytesToBase64(new Uint8Array(encrypted)),
    encryptionIv: bytesToBase64(iv)
  };
}

async function decryptCredentials(record: { encrypted_credentials: string; encryption_iv: string }) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.encryption_iv) },
    await encryptionKey(),
    base64ToBytes(record.encrypted_credentials)
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as Credentials;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function requirePro(userId: string) {
  const { data: profile, error } = await database
    .from("profiles")
    .select("is_pro, trial_started_at, trial_ends_at, trial_expired_at, trial_converted_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  const trialActive = Boolean(
    profile.trial_started_at
    && profile.trial_ends_at
    && new Date(profile.trial_ends_at).getTime() > Date.now()
    && !profile.trial_expired_at
    && !profile.trial_converted_at
  );
  if (!profile.is_pro && !trialActive) {
    throw Object.assign(new Error("Moneybird is beschikbaar met Overuurtje Pro."), { status: 403 });
  }
}

async function connectionFor(userId: string) {
  const { data, error } = await database
    .from("accounting_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "moneybird")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function credentialsFor(connectionId: string) {
  const { data, error } = await database
    .from("accounting_credentials")
    .select("encrypted_credentials, encryption_iv, token_expires_at")
    .eq("connection_id", connectionId)
    .single();
  if (error) throw error;
  return decryptCredentials(data);
}

async function storeCredentials(connectionId: string, credentials: Credentials) {
  const encrypted = await encryptCredentials(credentials);
  const { error } = await database.from("accounting_credentials").upsert({
    connection_id: connectionId,
    encrypted_credentials: encrypted.encryptedCredentials,
    encryption_iv: encrypted.encryptionIv,
    token_expires_at: credentials.expiresAt || null,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

function moneybirdError(status: number) {
  if (status === 401) return "De Moneybird-verbinding is verlopen. Verbind Moneybird opnieuw.";
  if (status === 403) return "Moneybird heeft onvoldoende rechten voor deze actie.";
  if (status === 404) return "De gevraagde Moneybird-gegevens zijn niet gevonden.";
  if (status === 422) return "Moneybird kon de factuurgegevens niet verwerken. Controleer klant, btw en grootboek.";
  if (status === 429) return "Moneybird is tijdelijk te vaak benaderd. Probeer het over een paar minuten opnieuw.";
  return "Moneybird is tijdelijk niet bereikbaar.";
}

async function refreshAccessToken(connectionId: string, credentials: Credentials) {
  if (!credentials.refreshToken || !clientId || !clientSecret) return credentials;
  const response = await fetch("https://moneybird.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!response.ok) throw Object.assign(new Error("De Moneybird-verbinding is verlopen. Verbind opnieuw."), { status: 401 });
  const token = await response.json();
  const refreshed: Credentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || credentials.refreshToken,
    tokenType: token.token_type || "Bearer",
    expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null
  };
  await storeCredentials(connectionId, refreshed);
  return refreshed;
}

async function moneybirdFetch(
  connection: Record<string, unknown>,
  path: string,
  options: RequestInit = {},
  canRefresh = true
) {
  let credentials = await credentialsFor(String(connection.id));
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() < Date.now() + 60000) {
    credentials = await refreshAccessToken(String(connection.id), credentials);
  }
  const response = await fetch(`https://moneybird.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && canRefresh && credentials.refreshToken) {
    credentials = await refreshAccessToken(String(connection.id), credentials);
    return moneybirdFetch(connection, path, options, false);
  }
  if (!response.ok) {
    const details = (await response.text()).slice(0, 2000);
    console.error("Moneybird API-fout", { status: response.status, path, details });
    throw Object.assign(new Error(moneybirdError(response.status)), { status: response.status });
  }
  if (response.status === 204) return null;
  return response.json();
}

async function listAdministrations(connection: Record<string, unknown>) {
  return moneybirdFetch(connection, "/api/v2/administrations.json");
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");
}

function validateExportModel(model: ExportModel) {
  if (!model || !["workday", "project"].includes(model.sourceType)) throw new Error("Ongeldige exportbron.");
  if (!/^[0-9a-f-]{36}$/i.test(model.sourceId || "")) throw new Error("Ongeldige exportbron.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(model.date || "")) throw new Error("Ongeldige factuurdatum.");
  if (!model.customer?.name?.trim()) throw new Error("Kies eerst een opdrachtgever.");
  if (!Array.isArray(model.lineItems) || !model.lineItems.length) throw new Error("Er zijn geen factuurregels om te exporteren.");
  model.lineItems.forEach((line) => {
    if (!line.description?.trim() || !(Number(line.quantity) > 0) || !Number.isFinite(Number(line.unitPrice))) {
      throw new Error("Een factuurregel is niet volledig.");
    }
  });
}

async function verifySourceOwnership(userId: string, model: ExportModel) {
  if (model.sourceType === "workday") {
    const { data } = await database.from("workdays").select("id").eq("id", model.sourceId).eq("user_id", userId).maybeSingle();
    if (!data) throw Object.assign(new Error("Deze werkdag is niet van jou."), { status: 403 });
  } else {
    const { data } = await database.from("projects").select("id").eq("id", model.sourceId).eq("user_id", userId).maybeSingle();
    if (!data) throw Object.assign(new Error("Dit project is niet van jou."), { status: 403 });
    const dayIds = (model.sourceItems || []).filter((item) => item.sourceType === "project_day").map((item) => item.sourceId);
    if (!dayIds.length) throw new Error("Selecteer minimaal één projectdag.");
    const days = await database.from("project_days").select("id").eq("project_id", model.sourceId).in("id", dayIds);
    if (days.error || (days.data || []).length !== new Set(dayIds).size) {
      throw Object.assign(new Error("Een geselecteerde projectdag hoort niet bij dit project."), { status: 403 });
    }
  }
}

async function createDraft(userId: string, connection: Record<string, unknown>, body: Record<string, unknown>) {
  const model = body.exportModel as ExportModel;
  validateExportModel(model);
  await verifySourceOwnership(userId, model);
  const administrationId = String(connection.administration_id || "");
  if (!administrationId) throw new Error("Kies eerst een Moneybird-administratie.");

  const contactId = String(body.contactId || model.customer.externalContactId || "");
  if (!contactId) throw new Error("Kies eerst een Moneybird-contact.");
  const taxMappings = (body.taxMappings || {}) as Record<string, string>;
  const ledgerMappings = (body.ledgerMappings || {}) as Record<string, string>;
  for (const line of model.lineItems) {
    if (!taxMappings[String(Number(line.vatPercentage))]) throw new Error(`Koppel eerst ${line.vatPercentage}% btw aan Moneybird.`);
    if (!ledgerMappings[line.category] && !ledgerMappings.default) throw new Error(`Kies een grootboekrekening voor ${line.description}.`);
  }

  const itemSignature = [...(model.sourceItems || [])]
    .sort((a, b) => `${a.sourceType}:${a.sourceId}`.localeCompare(`${b.sourceType}:${b.sourceId}`))
    .map((item) => `${item.sourceType}:${item.sourceId}`).join("|");
  const reexportKey = typeof body.reexportKey === "string" && /^[0-9a-f-]{36}$/i.test(body.reexportKey)
    ? body.reexportKey
    : "";
  const idempotencyKey = await sha256(`${userId}|${administrationId}|${model.sourceType}|${model.sourceId}|${itemSignature}|${reexportKey}`);
  const reference = `Overuurtje ${model.reference || model.sourceId.slice(0, 8)} [${idempotencyKey.slice(0, 10)}]`.slice(0, 100);

  const exportRecord = {
    user_id: userId,
    connection_id: connection.id,
    provider: "moneybird",
    administration_id: administrationId,
    source_type: model.sourceType,
    source_id: model.sourceId,
    project_id: model.sourceType === "project" ? model.sourceId : null,
    workday_id: model.sourceType === "workday" ? model.sourceId : null,
    status: "creating",
    idempotency_key: idempotencyKey,
    request_snapshot: { ...model, customer: { ...model.customer, externalContactId: contactId } },
    last_error: null,
    updated_at: new Date().toISOString()
  };
  const existingResult = await database.from("accounting_exports")
    .select("*").eq("user_id", userId).eq("provider", "moneybird").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data?.status === "created") return { export: existingResult.data, alreadyCreated: true };

  let exportClaim;
  if (existingResult.data) {
    const isStale = existingResult.data.status === "creating"
      && Date.now() - new Date(existingResult.data.updated_at).getTime() > 5 * 60 * 1000;
    if (existingResult.data.status === "creating" && !isStale) {
      throw Object.assign(new Error("Deze conceptfactuur wordt al aangemaakt."), { status: 409 });
    }
    exportClaim = await database.from("accounting_exports")
      .update(exportRecord)
      .eq("id", existingResult.data.id)
      .eq("status", existingResult.data.status)
      .eq("updated_at", existingResult.data.updated_at)
      .select()
      .maybeSingle();
    if (exportClaim.error) throw exportClaim.error;
    if (!exportClaim.data) {
      throw Object.assign(new Error("Deze conceptfactuur wordt al aangemaakt."), { status: 409 });
    }
  } else {
    exportClaim = await database.from("accounting_exports").insert(exportRecord).select().single();
    if (exportClaim.error?.code === "23505") {
      const concurrent = await database.from("accounting_exports")
        .select("*").eq("user_id", userId).eq("provider", "moneybird").eq("idempotency_key", idempotencyKey).single();
      if (concurrent.error) throw concurrent.error;
      if (concurrent.data.status === "created") return { export: concurrent.data, alreadyCreated: true };
      throw Object.assign(new Error("Deze conceptfactuur wordt al aangemaakt."), { status: 409 });
    }
    if (exportClaim.error) throw exportClaim.error;
  }

  try {
    // A timed-out earlier request may still have succeeded. Moneybird supports
    // finding drafts by reference, so retrying remains idempotent.
    let invoice = null;
    try {
      invoice = await moneybirdFetch(
        connection,
        `/api/v2/${administrationId}/sales_invoices/find_by_reference/${encodeURIComponent(reference)}.json`
      );
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    if (!invoice) {
      invoice = await moneybirdFetch(connection, `/api/v2/${administrationId}/sales_invoices.json`, {
        method: "POST",
        body: JSON.stringify({
          sales_invoice: {
            contact_id: contactId,
            reference,
            invoice_date: model.date,
            currency: "EUR",
            prices_are_incl_tax: false,
            details_attributes: model.lineItems.map((line) => ({
              description: line.description,
              price: Number(line.unitPrice).toFixed(2),
              amount: String(Number(line.quantity)),
              tax_rate_id: taxMappings[String(Number(line.vatPercentage))],
              ledger_account_id: ledgerMappings[line.category] || ledgerMappings.default
            }))
          }
        })
      });
    }

    const updated = await database.from("accounting_exports").update({
      status: "created",
      external_invoice_id: String(invoice.id),
      external_invoice_url: invoice.url || null,
      external_state: invoice.state || "draft",
      last_error: null,
      updated_at: new Date().toISOString()
    }).eq("id", exportClaim.data.id).select().single();
    if (updated.error) throw updated.error;
    if (model.sourceItems?.length) {
      const items = model.sourceItems.map((item) => ({
        export_id: exportClaim.data.id,
        user_id: userId,
        source_type: item.sourceType,
        source_id: item.sourceId
      }));
      const itemResult = await database.from("accounting_export_items").upsert(items, {
        onConflict: "export_id,source_type,source_id"
      });
      if (itemResult.error) console.error("Exportitems konden niet worden geregistreerd.", itemResult.error);
    }
    return { export: updated.data, alreadyCreated: false };
  } catch (error) {
    await database.from("accounting_exports").update({
      status: "failed",
      last_error: String((error as Error).message || error).slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq("id", exportClaim.data.id);
    throw error;
  }
}

async function handleCallback(url: URL) {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || !code) return redirect("/account.html?accounting=moneybird-error");
  const stateHash = await sha256(state);
  const stateResult = await database.from("accounting_oauth_states")
    .select("*").eq("provider", "moneybird").eq("state_hash", stateHash).maybeSingle();
  const record = stateResult.data;
  if (stateResult.error || !record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) {
    return redirect("/account.html?accounting=moneybird-state-expired");
  }
  await database.from("accounting_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", record.id);
  const tokenResponse = await fetch("https://moneybird.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })
  });
  if (!tokenResponse.ok) {
    console.error("Moneybird token exchange mislukt", tokenResponse.status, (await tokenResponse.text()).slice(0, 1000));
    return redirect("/account.html?accounting=moneybird-error");
  }
  const token = await tokenResponse.json();
  const connectionResult = await database.from("accounting_connections").upsert({
    user_id: record.user_id,
    provider: "moneybird",
    status: "connected",
    scopes: String(token.scope || "sales_invoices settings").split(/\s+/).filter(Boolean),
    last_error: null,
    disconnected_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,provider" }).select().single();
  if (connectionResult.error) return redirect("/account.html?accounting=moneybird-error");
  await storeCredentials(connectionResult.data.id, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type || "Bearer",
    expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null
  });
  const administrations = await listAdministrations(connectionResult.data);
  if (administrations.length === 1) {
    await database.from("accounting_connections").update({
      administration_id: String(administrations[0].id),
      administration_name: administrations[0].name,
      last_validated_at: new Date().toISOString()
    }).eq("id", connectionResult.data.id);
  }
  return redirect(`${record.return_path || "/account.html"}?accounting=moneybird-connected`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/callback")) return handleCallback(url);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const user = await currentUser(request);
    if (!user) return json({ error: "Log opnieuw in om Moneybird te gebruiken." }, 401);
    await requirePro(user.id);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "startOAuth") {
      if (!clientId || !clientSecret || !redirectUri) throw new Error("Moneybird OAuth is nog niet geconfigureerd.");
      const state = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
      const stateResult = await database.from("accounting_oauth_states").insert({
        user_id: user.id,
        provider: "moneybird",
        state_hash: await sha256(state),
        return_path: "/account.html",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });
      if (stateResult.error) throw stateResult.error;
      const authorizationUrl = new URL("https://moneybird.com/oauth/authorize");
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "sales_invoices settings",
        state
      }).toString();
      return json({ authorizationUrl: authorizationUrl.toString() });
    }

    if (action === "connectDevelopment") {
      if (!allowDevelopmentPat || !developmentPat) throw Object.assign(new Error("De Moneybird-testmodus staat niet aan."), { status: 403 });
      const connectionResult = await database.from("accounting_connections").upsert({
        user_id: user.id,
        provider: "moneybird",
        status: "connected",
        scopes: ["sales_invoices", "settings"],
        last_error: null,
        disconnected_at: null,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,provider" }).select().single();
      if (connectionResult.error) throw connectionResult.error;
      await storeCredentials(connectionResult.data.id, { accessToken: developmentPat, tokenType: "Bearer" });
      return json({ connected: true });
    }

    const connection = await connectionFor(user.id);
    if (action === "status") return json({ connection: connection || null });
    if (!connection || connection.status === "disconnected") throw new Error("Verbind eerst Moneybird.");

    if (action === "administrations") return json({ administrations: await listAdministrations(connection) });
    if (action === "selectAdministration") {
      const administrations = await listAdministrations(connection);
      const administration = administrations.find((item: Record<string, unknown>) => String(item.id) === String(body.administrationId));
      if (!administration) throw new Error("Deze Moneybird-administratie is niet beschikbaar.");
      const result = await database.from("accounting_connections").update({
        administration_id: String(administration.id),
        administration_name: administration.name,
        status: "connected",
        last_validated_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString()
      }).eq("id", connection.id).select().single();
      if (result.error) throw result.error;
      return json({ connection: result.data });
    }
    if (action === "validate") {
      await listAdministrations(connection);
      await database.from("accounting_connections").update({
        status: "connected", last_validated_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString()
      }).eq("id", connection.id);
      return json({ valid: true });
    }
    if (action === "disconnect") {
      await database.from("accounting_credentials").delete().eq("connection_id", connection.id);
      await database.from("accounting_connections").update({
        status: "disconnected", administration_id: null, administration_name: null,
        disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", connection.id);
      return json({ disconnected: true });
    }

    const administrationId = String(connection.administration_id || "");
    if (!administrationId) throw new Error("Kies eerst een Moneybird-administratie.");
    if (action === "contacts") {
      const query = String(body.query || "").trim();
      const path = query
        ? `/api/v2/${administrationId}/contacts/filter.json?filter=${encodeURIComponent(query)}`
        : `/api/v2/${administrationId}/contacts.json?per_page=50`;
      const contacts = await moneybirdFetch(connection, path);
      return json({ contacts: contacts.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        name: item.company_name || [item.firstname, item.lastname].filter(Boolean).join(" ") || item.email || "Onbekend contact",
        email: item.email || ""
      })) });
    }
    if (action === "configurationOptions") {
      const [taxRates, ledgerAccounts] = await Promise.all([
        moneybirdFetch(connection, `/api/v2/${administrationId}/tax_rates.json?per_page=100`),
        moneybirdFetch(connection, `/api/v2/${administrationId}/ledger_accounts.json`)
      ]);
      return json({
        taxRates: taxRates.filter((item: Record<string, unknown>) => item.active !== false).map((item: Record<string, unknown>) => ({
          id: String(item.id), name: item.name, percentage: Number(item.percentage), taxRateType: item.tax_rate_type
        })),
        ledgerAccounts: ledgerAccounts.filter((item: Record<string, unknown>) =>
          item.active !== false
          && item.account_type === "revenue"
          && (!Array.isArray(item.allowed_document_types) || item.allowed_document_types.includes("sales_invoice"))
        ).map((item: Record<string, unknown>) => ({ id: String(item.id), name: item.name }))
      });
    }
    if (action === "createDraftInvoice") return json(await createDraft(user.id, connection, body));
    if (action === "exports") {
      const [result, itemResult] = await Promise.all([
        database.from("accounting_exports").select("*")
          .eq("user_id", user.id).eq("provider", "moneybird").order("created_at", { ascending: false }).limit(100),
        database.from("accounting_export_items").select("source_type, source_id, export_id")
          .eq("user_id", user.id).limit(500)
      ]);
      if (result.error) throw result.error;
      if (itemResult.error) throw itemResult.error;
      return json({ exports: result.data, items: itemResult.data });
    }
    throw Object.assign(new Error("Onbekende Moneybird-actie."), { status: 400 });
  } catch (error) {
    const typed = error as { message?: string; status?: number };
    console.error("Accounting Moneybird-fout", { message: typed.message, status: typed.status });
    return json({ error: typed.message || "Moneybird kon de actie niet uitvoeren." }, Number(typed.status) || 500);
  }
});
