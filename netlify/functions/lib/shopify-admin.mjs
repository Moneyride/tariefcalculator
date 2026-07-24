import { normalizeShopDomain } from "./subscription-utils.mjs";

let cachedToken = "";
let tokenExpiresAt = 0;

function configuration() {
  const shop = normalizeShopDomain(process.env.SHOPIFY_STORE_DOMAIN);
  const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(
    process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || ""
  ).trim();

  if (!shop || !clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID en SHOPIFY_API_SECRET zijn verplicht."
    );
  }
  return { shop, clientId, clientSecret };
}

async function accessToken(fetchImpl = fetch) {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { shop, clientId, clientSecret } = configuration();
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error("Shopify Admin-token ophalen mislukt.");
  }

  cachedToken = result.access_token;
  const lifetime = Math.max(60, Number(result.expires_in || 3600));
  tokenExpiresAt = Date.now() + (lifetime - 30) * 1000;
  return cachedToken;
}

export async function fetchCustomerTags(customerId, fetchImpl = fetch) {
  const numericId = String(customerId || "").replace(/^gid:\/\/shopify\/Customer\//, "");
  if (!numericId) return [];

  const { shop } = configuration();
  const token = await accessToken(fetchImpl);
  const response = await fetchImpl(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({
      query: `query CustomerTags($id: ID!) {
        customer(id: $id) {
          tags
        }
      }`,
      variables: { id: `gid://shopify/Customer/${numericId}` }
    })
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error("Shopify-klanttags ophalen mislukt.");
  }
  return result?.data?.customer?.tags || [];
}
