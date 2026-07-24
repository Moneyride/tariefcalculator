import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  billingIntervalFromLine,
  calculatePaidThrough,
  extractOrderEmail,
  findProLine,
  normalizeShopDomain,
  resolveCustomerEntitlement
} from "./lib/subscription-utils.mjs";
import {
  findProfileByCustomerId,
  findProfileByEmail,
  getWebhookEvent,
  recordWebhookEvent,
  updateProfile,
  updateWebhookEvent
} from "./lib/supabase-admin.mjs";

function response(status, body) {
  return Response.json(body, { status });
}

function validHmac(rawBody, suppliedHmac) {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret || !suppliedHmac) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const supplied = Buffer.from(suppliedHmac, "utf8");
  const calculated = Buffer.from(expected, "utf8");
  return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
}

function validateShop(shopHeader) {
  const expected = normalizeShopDomain(process.env.SHOPIFY_STORE_DOMAIN);
  return Boolean(expected && normalizeShopDomain(shopHeader) === expected);
}

async function processPaidOrder(order) {
  const productId = process.env.SHOPIFY_PRO_PRODUCT_ID;
  const line = findProLine(order, productId);
  if (!line) return { ignored: true, reason: "other_product" };

  const email = extractOrderEmail(order);
  if (!email) throw new Error("De betaalde bestelling bevat geen e-mailadres.");

  const profile = await findProfileByEmail(email);
  if (!profile) {
    throw new Error(`Geen Overuurtje-account gevonden voor ${email}.`);
  }

  const customerId = String(order?.customer?.id || "");
  const paidAt = order?.processed_at || order?.created_at || new Date().toISOString();
  const paidThrough = calculatePaidThrough({
    paidAt,
    currentPeriodEnd: profile.subscription_current_period_end,
    interval: billingIntervalFromLine(line)
  });

  await updateProfile(profile.id, {
    is_pro: true,
    subscription_status: "active",
    subscription_provider: "shopify",
    subscription_customer_id: customerId || profile.subscription_customer_id,
    subscription_current_period_end: paidThrough,
    subscription_cancel_at_period_end: false,
    subscription_updated_at: new Date().toISOString()
  });

  return { updated: true, profileId: profile.id };
}

export async function findProfileForCustomer(
  { customerId, email },
  {
    findByCustomerId = findProfileByCustomerId,
    findByEmail = findProfileByEmail
  } = {}
) {
  const profileByCustomerId = customerId
    ? await findByCustomerId(customerId)
    : null;

  if (profileByCustomerId) return profileByCustomerId;
  return email ? findByEmail(email) : null;
}

async function processCustomerUpdate(customer) {
  const customerId = String(customer?.id || "");
  const email = extractOrderEmail(customer);
  const profile = await findProfileForCustomer({ customerId, email });

  if (!profile) return { ignored: true, reason: "unknown_customer" };

  const entitlement = resolveCustomerEntitlement({
    tags: customer?.tags,
    currentPeriodEnd: profile.subscription_current_period_end
  });
  if (!entitlement.recognized) return { ignored: true, reason: "no_overuurtje_tag" };

  await updateProfile(profile.id, {
    is_pro: entitlement.isPro,
    subscription_status: entitlement.status,
    subscription_provider: "shopify",
    subscription_customer_id: customerId || profile.subscription_customer_id,
    subscription_cancel_at_period_end: entitlement.cancelAtPeriodEnd,
    subscription_updated_at: new Date().toISOString()
  });

  return { updated: true, profileId: profile.id };
}

export default async function handler(request) {
  if (request.method !== "POST") return response(405, { error: "Method not allowed" });

  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = String(request.headers.get("x-shopify-topic") || "").toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const shop = request.headers.get("x-shopify-shop-domain");

  if (!validHmac(rawBody, hmac) || !validateShop(shop)) {
    return response(401, { error: "Ongeldige Shopify-handtekening." });
  }
  if (!webhookId || !topic) return response(400, { error: "Webhookmetadata ontbreekt." });

  const existing = await getWebhookEvent(webhookId);
  if (existing?.status === "processed") return response(200, { duplicate: true });

  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  await recordWebhookEvent({
    webhook_id: webhookId,
    topic,
    shop_domain: normalizeShopDomain(shop),
    payload_hash: payloadHash,
    status: "processing",
    attempts: Number(existing?.attempts || 0) + 1,
    last_error: null,
    received_at: new Date().toISOString(),
    processed_at: null
  });

  try {
    const payload = JSON.parse(rawBody);
    let result;
    if (topic === "orders/paid") result = await processPaidOrder(payload);
    else if (topic === "customers/update") result = await processCustomerUpdate(payload);
    else result = { ignored: true, reason: "unsupported_topic" };

    await updateWebhookEvent(webhookId, {
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null
    });
    return response(200, result);
  } catch (error) {
    await updateWebhookEvent(webhookId, {
      status: "failed",
      last_error: String(error?.message || error).slice(0, 500)
    });
    console.error("Shopify-webhook mislukt.", error);
    return response(500, { error: "Webhook kon niet worden verwerkt." });
  }
}

export const config = {
  path: "/api/shopify/webhook"
};
