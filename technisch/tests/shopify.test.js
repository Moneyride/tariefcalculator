import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  billingIntervalFromLine,
  calculatePaidThrough,
  normalizeShopDomain,
  orderContainsProduct,
  resolveCustomerEntitlement
} from "../../netlify/functions/lib/subscription-utils.mjs";
import { fetchCustomerTags } from "../../netlify/functions/lib/shopify-admin.mjs";
import { findProfileForCustomer } from "../../netlify/functions/shopify-webhook.mjs";
import { sendTrialReminder, trialReminderMessage } from "../../netlify/functions/lib/trial-email.mjs";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testsDirectory, "../..");

test("Shopify-winkel en Pro-product worden strikt herkend", () => {
  assert.equal(normalizeShopDomain("https://TheGearHarbor.com/products/test"), "thegearharbor.com");
  assert.equal(orderContainsProduct({ line_items: [{ product_id: 123 }] }, "123"), true);
  assert.equal(orderContainsProduct({ line_items: [{ product_id: 456 }] }, "123"), false);
});

test("maand- en jaarabonnementen leveren een betaalde einddatum op", () => {
  assert.equal(
    billingIntervalFromLine({ selling_plan_allocation: { selling_plan: { name: "Deliver every year" } } }),
    "year"
  );
  assert.equal(
    calculatePaidThrough({ paidAt: "2026-01-31T12:00:00.000Z", interval: "month" }),
    "2026-02-28T12:00:00.000Z"
  );
  assert.equal(
    calculatePaidThrough({ paidAt: "2026-02-01T12:00:00.000Z", interval: "year" }),
    "2027-02-01T12:00:00.000Z"
  );
});

test("Shopify Flow-tags sturen de Pro-status zonder betaalde tijd weg te gooien", () => {
  const active = resolveCustomerEntitlement({
    tags: "nieuwsbrief, overuurtje-pro-active",
    currentPeriodEnd: "2026-08-24T12:00:00.000Z",
    now: new Date("2026-07-24T12:00:00.000Z")
  });
  assert.equal(active.isPro, true);
  assert.equal(active.status, "active");

  const cancelled = resolveCustomerEntitlement({
    tags: "overuurtje-pro-cancelled",
    currentPeriodEnd: "2026-08-24T12:00:00.000Z",
    now: new Date("2026-07-24T12:00:00.000Z")
  });
  assert.equal(cancelled.isPro, true);
  assert.equal(cancelled.cancelAtPeriodEnd, true);

  const expired = resolveCustomerEntitlement({
    tags: "overuurtje-pro-cancelled",
    currentPeriodEnd: "2026-07-23T12:00:00.000Z",
    now: new Date("2026-07-24T12:00:00.000Z")
  });
  assert.equal(expired.isPro, false);
  assert.equal(expired.status, "free");
});

test("een nieuwe Shopify-klant wordt na een ontbrekende klant-ID op e-mail gekoppeld", async () => {
  const calls = [];
  const profile = await findProfileForCustomer(
    {
      customerId: "12345",
      email: "test@overuurtje.nl"
    },
    {
      findByCustomerId: async (customerId) => {
        calls.push(`customer:${customerId}`);
        return null;
      },
      findByEmail: async (email) => {
        calls.push(`email:${email}`);
        return { id: "profile-1" };
      }
    }
  );

  assert.deepEqual(calls, [
    "customer:12345",
    "email:test@overuurtje.nl"
  ]);
  assert.equal(profile.id, "profile-1");
});

test("ontbrekende webhooktags worden via de Shopify Admin API opgehaald", async () => {
  const previousEnvironment = {
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET
  };
  process.env.SHOPIFY_STORE_DOMAIN = "test-shop.myshopify.com";
  process.env.SHOPIFY_CLIENT_ID = "client-id";
  process.env.SHOPIFY_API_SECRET = "client-secret";

  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/admin/oauth/access_token")) {
      return Response.json({ access_token: "admin-token", expires_in: 3600 });
    }
    return Response.json({
      data: {
        customer: {
          tags: ["overuurtje-pro-active"]
        }
      }
    });
  };

  try {
    const tags = await fetchCustomerTags("12345", fetchImpl);
    assert.deepEqual(tags, ["overuurtje-pro-active"]);
    assert.equal(requests.length, 2);
    assert.equal(
      JSON.parse(requests[1].options.body).variables.id,
      "gid://shopify/Customer/12345"
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Shopify-sync blijft server-only en controleert HMAC en duplicaten", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607240001_shopify_webhooks.sql"),
    "utf8"
  );
  const webhook = await readFile(
    path.join(rootDirectory, "netlify/functions/shopify-webhook.mjs"),
    "utf8"
  );
  const expiry = await readFile(
    path.join(rootDirectory, "netlify/functions/expire-subscriptions.mjs"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.shopify_webhook_events/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all .* anon, authenticated/i);
  assert.match(webhook, /x-shopify-hmac-sha256/i);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /x-shopify-webhook-id/i);
  assert.match(webhook, /topic === "orders\/paid"/);
  assert.match(webhook, /topic === "customers\/update"/);
  assert.match(webhook, /findProfileForCustomer/);
  assert.match(expiry, /schedule: "15 3 \* \* \*"/);
  assert.match(expiry, /listExpiredSubscriptions/);
  assert.match(expiry, /processTrialTransitions/);
  assert.match(expiry, /listPendingTrialReminderEmails/);
  assert.match(expiry, /sendTrialReminder/);
  const supabaseAdmin = await readFile(
    path.join(rootDirectory, "netlify/functions/lib/supabase-admin.mjs"),
    "utf8"
  );
  assert.match(supabaseAdmin, /subscription_status:\s*"in\.\(cancelled,past_due\)"/);
});

test("trialwaarschuwing wordt via de bestaande servertaak eenmaal per profiel verzonden", async () => {
  const profile = {
    id: "profile-1",
    email: "test@overuurtje.nl",
    display_name: "Chris Reichgelt",
    trial_ends_at: "2026-08-31T12:00:00.000Z"
  };
  const message = trialReminderMessage(profile);
  assert.equal(message.subject, "Je gratis Pro-periode eindigt over 7 dagen");
  assert.match(message.html, /automatisch terug naar Free/i);
  assert.match(message.html, /opgeslagen werkdagen, projecten, apparatuur en instellingen blijven bewaard/i);
  assert.match(message.html, /Er wordt niets automatisch afgeschreven/i);

  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const requests = [];
  try {
    const result = await sendTrialReminder(profile, async (url, options) => {
      requests.push({ url, options });
      return new Response("{}", { status: 200 });
    });
    assert.equal(result.sent, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.resend.com/emails");
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});
