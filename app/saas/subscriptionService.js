(function initializeSubscriptionService() {
  "use strict";

  const config = globalThis.OveruurtjeConfig;
  const MOCK_KEY = "overuurtjeMockSubscription";

  function getMockPlan() {
    if (!config.allowMockSubscriptions) return null;
    try {
      return localStorage.getItem(MOCK_KEY) === "pro" ? "pro" : "free";
    } catch {
      return "free";
    }
  }

  function setMockPlan(plan) {
    if (!config.allowMockSubscriptions) return false;
    localStorage.setItem(MOCK_KEY, plan === "pro" ? "pro" : "free");
    document.dispatchEvent(new CustomEvent("overuurtje:subscription-changed"));
    return true;
  }

  function resolve(profile) {
    const mockPlan = getMockPlan();
    const now = Date.now();
    const trialEndsAt = profile?.trialEndsAt || null;
    const trialEndTime = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
    const isPaidPro = mockPlan ? mockPlan === "pro" : Boolean(profile?.isPro);
    const isTrial = !mockPlan
      && !isPaidPro
      && Boolean(profile?.trialStartedAt)
      && Number.isFinite(trialEndTime)
      && trialEndTime > now
      && !profile?.trialExpiredAt
      && !profile?.trialConvertedAt;
    const isExpiredTrial = !mockPlan
      && !isPaidPro
      && Boolean(profile?.trialStartedAt)
      && Number.isFinite(trialEndTime)
      && trialEndTime <= now
      && !profile?.trialConvertedAt;
    const isPro = isPaidPro || isTrial;
    const trialDaysRemaining = isTrial
      ? Math.max(1, Math.ceil((trialEndTime - now) / 86400000))
      : 0;
    return {
      isPro,
      isPaidPro,
      isTrial,
      isExpiredTrial,
      trialEndsAt,
      trialDaysRemaining,
      plan: isPaidPro ? "pro" : (isTrial ? "pro_trial" : (isExpiredTrial ? "expired_trial" : "free")),
      status: mockPlan ? `mock_${mockPlan}` : (profile?.subscriptionStatus || "free"),
      provider: profile?.subscriptionProvider || "shopify",
      isMock: Boolean(mockPlan)
    };
  }

  function openExternal(url) {
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  globalThis.OveruurtjeSubscriptions = Object.freeze({
    resolve,
    setMockPlan,
    canMock: () => config.allowMockSubscriptions,
    canManage: () => Boolean(config.shopifyManageUrl),
    openCheckout: () => openExternal(config.shopifyCheckoutUrl),
    openManagement: () => openExternal(config.shopifyManageUrl)
  });
})();
