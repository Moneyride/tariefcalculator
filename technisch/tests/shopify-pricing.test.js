import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeShopifyPricing } from "../../netlify/functions/shopify-pricing.mjs";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testsDirectory, "../..");

test("Shopify selling plans worden omgerekend naar maand-, jaar- en voordeelprijzen", () => {
  const pricing = normalizeShopifyPricing({
    id: 10937234227546,
    currency: "EUR",
    variants: [{
      id: 1,
      selling_plan_allocations: [
        { selling_plan_id: 101, price: 299 },
        { selling_plan_id: 102, price: 2999 }
      ]
    }],
    selling_plan_groups: [{
      selling_plans: [
        { id: 101, name: "Deliver every month", options: [{ value: "1 Month" }] },
        { id: 102, name: "Deliver every year", options: [{ value: "1 Year" }] }
      ]
    }]
  }, "https://thegearharbor.com/products/overuurtje-pro-digitaal-abonnement");

  assert.equal(pricing.monthly.amount, 299);
  assert.equal(pricing.yearly.amount, 2999);
  assert.equal(pricing.regularYearAmount, 3588);
  assert.equal(pricing.savingsAmount, 589);
  assert.equal(pricing.monthly.interval, "month");
  assert.equal(pricing.yearly.interval, "year");
});

test("account toont Shopify-prijzen dynamisch en Netlify publiceert het prijs-endpoint", async () => {
  const [accountHtml, accountScript, netlifyConfig] = await Promise.all([
    readFile(path.join(rootDirectory, "app/account.html"), "utf8"),
    readFile(path.join(rootDirectory, "app/account.js"), "utf8"),
    readFile(path.join(rootDirectory, "netlify.toml"), "utf8")
  ]);

  assert.match(accountHtml, /id="subscription-monthly-price"/);
  assert.match(accountHtml, /id="subscription-yearly-price"/);
  assert.doesNotMatch(accountHtml, /€ 2,99/);
  assert.match(accountScript, /fetch\("\/api\/shopify\/pricing"/);
  assert.match(netlifyConfig, /from = "\/api\/shopify\/pricing"/);
});
