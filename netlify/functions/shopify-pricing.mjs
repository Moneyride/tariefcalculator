const DEFAULT_STOREFRONT_DOMAIN = "thegearharbor.com";
const DEFAULT_PRODUCT_HANDLE = "overuurtje-pro-digitaal-abonnement";

export const FALLBACK_SHOPIFY_PRICING = Object.freeze({
  productId: "",
  productUrl: `https://${DEFAULT_STOREFRONT_DOMAIN}/products/${DEFAULT_PRODUCT_HANDLE}`,
  currency: "EUR",
  monthly: Object.freeze({ amountCents: 299, planId: "", interval: "month" }),
  yearly: Object.freeze({ amountCents: 2999, planId: "", interval: "year" }),
  regularYearAmountCents: 3588,
  savingsAmountCents: 589,
  savingsMonths: 2,
  source: "fallback"
});

function integerAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function planInterval(plan) {
  const description = [
    plan?.name,
    ...(plan?.options || []).map((option) => option?.value || option?.name)
  ].filter(Boolean).join(" ").toLowerCase();
  if (/year|jaar|annual/.test(description)) return "year";
  if (/month|maand|monthly/.test(description)) return "month";
  return null;
}

function allocationPrice(variant, plan) {
  const allocation = (variant?.selling_plan_allocations || []).find(
    (item) => String(item?.selling_plan_id) === String(plan?.id)
  );
  const allocatedPrice = integerAmount(allocation?.price);
  if (allocatedPrice !== null) return allocatedPrice;

  const fixedPrice = (plan?.price_adjustments || []).find(
    (adjustment) => adjustment?.value_type === "price"
  );
  return integerAmount(fixedPrice?.value);
}

export function normalizeShopifyPricing(product, productUrl) {
  const plans = (product?.selling_plan_groups || []).flatMap((group) => group?.selling_plans || []);
  const monthlyPlan = plans.find((plan) => planInterval(plan) === "month");
  const yearlyPlan = plans.find((plan) => planInterval(plan) === "year");
  const variant = (product?.variants || []).find((item) => {
    const ids = new Set((item?.selling_plan_allocations || []).map((allocation) => String(allocation?.selling_plan_id)));
    return ids.has(String(monthlyPlan?.id)) && ids.has(String(yearlyPlan?.id));
  }) || product?.variants?.[0];
  const monthlyAmount = allocationPrice(variant, monthlyPlan);
  const yearlyAmount = allocationPrice(variant, yearlyPlan);

  if (!monthlyPlan || !yearlyPlan || monthlyAmount === null || yearlyAmount === null) {
    throw new Error("Shopify bevat geen herkenbare maand- en jaarprijs voor Overuurtje Pro.");
  }

  const regularYearAmount = monthlyAmount * 12;
  const savingsAmount = Math.max(0, regularYearAmount - yearlyAmount);
  return {
    productId: String(product?.id || ""),
    productUrl,
    currency: String(product?.currency || "EUR").toUpperCase(),
    monthly: {
      amountCents: monthlyAmount,
      planId: String(monthlyPlan.id),
      interval: "month"
    },
    yearly: {
      amountCents: yearlyAmount,
      planId: String(yearlyPlan.id),
      interval: "year"
    },
    regularYearAmountCents: regularYearAmount,
    savingsAmountCents: savingsAmount,
    savingsMonths: monthlyAmount > 0 ? Number((savingsAmount / monthlyAmount).toFixed(1)) : 0,
    fetchedAt: new Date().toISOString()
  };
}

function publishedPricing(pricing, productUrl) {
  return {
    ...pricing,
    productUrl,
    monthly: {
      ...pricing.monthly,
      amountCents: FALLBACK_SHOPIFY_PRICING.monthly.amountCents
    },
    yearly: {
      ...pricing.yearly,
      amountCents: FALLBACK_SHOPIFY_PRICING.yearly.amountCents
    },
    regularYearAmountCents: FALLBACK_SHOPIFY_PRICING.regularYearAmountCents,
    savingsAmountCents: FALLBACK_SHOPIFY_PRICING.savingsAmountCents,
    savingsMonths: FALLBACK_SHOPIFY_PRICING.savingsMonths
  };
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const domain = String(process.env.SHOPIFY_STOREFRONT_DOMAIN || DEFAULT_STOREFRONT_DOMAIN)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const handle = process.env.SHOPIFY_PRO_PRODUCT_HANDLE || DEFAULT_PRODUCT_HANDLE;
  const productUrl = `https://${domain}/products/${handle}`;

  try {
    const response = await fetch(`${productUrl}.js`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Shopify antwoordde met status ${response.status}.`);
    const pricing = publishedPricing(
      normalizeShopifyPricing(await response.json(), productUrl),
      productUrl
    );
    return Response.json({ ...pricing, source: "shopify-product-fixed-price" }, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    console.error("Shopify-prijzen konden niet worden opgehaald.", error);
    return Response.json({
      ...FALLBACK_SHOPIFY_PRICING,
      productUrl,
      fetchedAt: new Date().toISOString()
    }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" }
    });
  }
}

export const config = {
  path: "/api/shopify/pricing"
};
