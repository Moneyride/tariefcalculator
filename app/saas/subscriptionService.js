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
    const isPro = mockPlan ? mockPlan === "pro" : Boolean(profile?.isPro);
    return {
      isPro,
      plan: isPro ? "pro" : "free",
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
    openCheckout: () => openExternal(config.shopifyCheckoutUrl),
    openManagement: () => openExternal(config.shopifyManageUrl)
  });
})();
