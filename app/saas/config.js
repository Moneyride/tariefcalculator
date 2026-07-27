(function initializeSaasConfig() {
  "use strict";

  const runtime = globalThis.OVERUURTJE_RUNTIME_CONFIG || {};
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
  const publicSiteUrl = new URL(String(runtime.publicSiteUrl || "https://overuurtje.nl"));

  const config = Object.freeze({
    publicSiteUrl: publicSiteUrl.href.replace(/\/$/, ""),
    supabaseUrl: String(runtime.supabaseUrl || "").replace(/\/$/, ""),
    supabaseAnonKey: String(runtime.supabaseAnonKey || ""),
    shopifyCheckoutUrl: String(runtime.shopifyCheckoutUrl || ""),
    shopifyManageUrl: String(runtime.shopifyManageUrl || ""),
    allowMockSubscriptions: Boolean(runtime.allowMockSubscriptions)
      || localHostnames.has(location.hostname)
      || location.protocol === "file:",
    dashboardUrl: new URL("dashboard.html", location.href).href,
    accountUrl: new URL("account.html", location.href).href,
    workdaysUrl: new URL("workdays.html", location.href).href,
    projectsUrl: new URL("projects.html", location.href).href,
    calculatorUrl: new URL("index.html", location.href).href,
    authAccountUrl: new URL("account.html", `${publicSiteUrl.href.replace(/\/$/, "")}/`).href,
    authWorkdaysUrl: new URL("workdays.html", `${publicSiteUrl.href.replace(/\/$/, "")}/`).href
  });

  globalThis.OveruurtjeConfig = config;
})();
