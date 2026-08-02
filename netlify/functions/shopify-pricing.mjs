const DEFAULT_STOREFRONT_DOMAIN = "thegearharbor.com";
const DEFAULT_PRODUCT_HANDLE = "overuurtje-pro-digitaal-abonnement";

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
  const variant = product?.variants?.[0];
  const plans = (product?.selling_plan_groups || []).flatMap((group) => group?.selling_plans || []);
  const monthlyPlan = plans.find((plan) => planInterval(plan) === "month");
  const yearlyPlan = plans.find((plan) => planInterval(plan) === "year");
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
      amount: monthlyAmount,
      planId: String(monthlyPlan.id),
      interval: "month"
    },
    yearly: {
      amount: yearlyAmount,
      planId: String(yearlyPlan.id),
      interval: "year"
    },
    regularYearAmount,
    savingsAmount,
    savingsMonths: monthlyAmount > 0 ? Number((savingsAmount / monthlyAmount).toFixed(1)) : 0,
    fetchedAt: new Date().toISOString()
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
    const pricing = normalizeShopifyPricing(await response.json(), productUrl);
    return Response.json(pricing, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
      }
    });
  } catch (error) {
    console.error("Shopify-prijzen konden niet worden opgehaald.", error);
    return Response.json(
      { error: "De actuele abonnementsprijzen zijn tijdelijk niet beschikbaar.", productUrl },
      { status: 502 }
    );
  }
}

export const config = {
  path: "/api/shopify/pricing"
};
