function configuration() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("SUPABASE_URL en SUPABASE_SECRET_KEY zijn verplicht.");
  return { url, key };
}

async function request(path, { method = "GET", body, prefer } = {}) {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

function queryPath(table, params) {
  const search = new URLSearchParams(params);
  return `${table}?${search.toString()}`;
}

export async function findProfileByEmail(email) {
  const rows = await request(queryPath("profiles", {
    select: "id,email,subscription_customer_id,subscription_current_period_end",
    email: `eq.${email}`,
    limit: "1"
  }));
  return rows?.[0] || null;
}

export async function findProfileByCustomerId(customerId) {
  const rows = await request(queryPath("profiles", {
    select: "id,email,subscription_customer_id,subscription_current_period_end",
    subscription_customer_id: `eq.${customerId}`,
    limit: "1"
  }));
  return rows?.[0] || null;
}

export async function updateProfile(profileId, values) {
  return request(queryPath("profiles", { id: `eq.${profileId}` }), {
    method: "PATCH",
    body: values,
    prefer: "return=minimal"
  });
}

export async function getWebhookEvent(webhookId) {
  const rows = await request(queryPath("shopify_webhook_events", {
    select: "webhook_id,status,attempts",
    webhook_id: `eq.${webhookId}`,
    limit: "1"
  }));
  return rows?.[0] || null;
}

export async function recordWebhookEvent(event) {
  return request("shopify_webhook_events?on_conflict=webhook_id", {
    method: "POST",
    body: event,
    prefer: "resolution=merge-duplicates,return=minimal"
  });
}

export async function updateWebhookEvent(webhookId, values) {
  return request(queryPath("shopify_webhook_events", { webhook_id: `eq.${webhookId}` }), {
    method: "PATCH",
    body: values,
    prefer: "return=minimal"
  });
}

export async function listExpiredSubscriptions(nowIso) {
  return request(queryPath("profiles", {
    select: "id",
    is_pro: "eq.true",
    subscription_cancel_at_period_end: "eq.true",
    subscription_current_period_end: `lte.${nowIso}`
  }));
}

