const DEFAULT_TAGS = Object.freeze({
  active: "overuurtje-pro-active",
  cancelled: "overuurtje-pro-cancelled",
  pastDue: "overuurtje-pro-past-due"
});

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeShopDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export function parseTags(value) {
  const tags = Array.isArray(value) ? value : String(value || "").split(",");
  return new Set(tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));
}

export function resolveCustomerEntitlement({
  tags,
  currentPeriodEnd,
  now = new Date(),
  tagNames = DEFAULT_TAGS
}) {
  const normalized = parseTags(tags);
  const active = normalized.has(tagNames.active.toLowerCase());
  const cancelled = normalized.has(tagNames.cancelled.toLowerCase());
  const pastDue = normalized.has(tagNames.pastDue.toLowerCase());
  const paidThrough = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const stillPaid = Boolean(paidThrough && Number.isFinite(paidThrough.getTime()) && paidThrough > now);

  if (active) {
    return {
      recognized: true,
      isPro: true,
      status: pastDue ? "past_due" : "active",
      cancelAtPeriodEnd: false
    };
  }

  if (cancelled) {
    return {
      recognized: true,
      isPro: stillPaid,
      status: stillPaid ? "cancelled" : "free",
      cancelAtPeriodEnd: stillPaid
    };
  }

  if (pastDue) {
    return {
      recognized: true,
      isPro: stillPaid,
      status: "past_due",
      cancelAtPeriodEnd: false
    };
  }

  return { recognized: false };
}

export function orderContainsProduct(order, productId) {
  const expected = String(productId || "").trim();
  return Boolean(expected && Array.isArray(order?.line_items)
    && order.line_items.some((item) => String(item?.product_id || "") === expected));
}

export function findProLine(order, productId) {
  const expected = String(productId || "").trim();
  return Array.isArray(order?.line_items)
    ? order.line_items.find((item) => String(item?.product_id || "") === expected) || null
    : null;
}

export function extractOrderEmail(order) {
  return normalizeEmail(order?.email || order?.contact_email || order?.customer?.email);
}

export function billingIntervalFromLine(line) {
  const allocation = line?.selling_plan_allocation;
  const plan = allocation?.selling_plan || {};
  const label = `${plan.name || ""} ${plan.description || ""}`.toLowerCase();

  if (/\b(year|yearly|annual|annually|jaar|jaarlijks)\b/.test(label)) return "year";
  return "month";
}

function addUtcMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const finalDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, finalDay));
  return result;
}

export function calculatePaidThrough({
  paidAt,
  currentPeriodEnd,
  interval = "month"
}) {
  const paidDate = new Date(paidAt || Date.now());
  const currentEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const base = currentEnd && Number.isFinite(currentEnd.getTime()) && currentEnd > paidDate
    ? currentEnd
    : paidDate;

  return addUtcMonths(base, interval === "year" ? 12 : 1).toISOString();
}

export { DEFAULT_TAGS };

