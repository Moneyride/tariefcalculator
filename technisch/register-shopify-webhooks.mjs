const shop = String(process.env.SHOPIFY_STORE_DOMAIN || "")
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");
const clientId = process.env.SHOPIFY_CLIENT_ID || "";
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "";
const webhookUrl = process.env.SHOPIFY_WEBHOOK_URL || "https://overuurtje.nl/api/shopify/webhook";
const apiVersion = "2026-07";

if (!shop || !clientId || !clientSecret) {
  throw new Error("Stel SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET in.");
}

async function getAccessToken() {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
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
    throw new Error(`Shopify-token ophalen mislukt: ${JSON.stringify(result)}`);
  }
  return result.access_token;
}

const token = await getAccessToken();

const mutation = `
  mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`;

async function register(topic) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        topic,
        webhookSubscription: {
          uri: webhookUrl,
          format: "JSON"
        }
      }
    })
  });

  const result = await response.json();
  const payload = result?.data?.webhookSubscriptionCreate;
  if (!response.ok || result.errors?.length || payload?.userErrors?.length) {
    throw new Error(`${topic}: ${JSON.stringify(result.errors || payload?.userErrors || result)}`);
  }

  return payload.webhookSubscription;
}

for (const topic of ["ORDERS_PAID", "CUSTOMERS_UPDATE"]) {
  const subscription = await register(topic);
  console.log(`${subscription.topic} -> ${subscription.uri}`);
}
