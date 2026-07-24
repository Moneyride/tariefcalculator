(function initializeSaasConfig() {
  "use strict";

  const runtime = globalThis.OVERUURTJE_RUNTIME_CONFIG || {};
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

  const config = Object.freeze({
    supabaseUrl: String(runtime.supabaseUrl || "").replace(/\/$/, ""),
    supabaseAnonKey: String(runtime.supabaseAnonKey || ""),
    shopifyCheckoutUrl: String(runtime.shopifyCheckoutUrl || ""),
    shopifyManageUrl: String(runtime.shopifyManageUrl || ""),
    allowMockSubscriptions: Boolean(runtime.allowMockSubscriptions)
      || localHostnames.has(location.hostname)
      || location.protocol === "file:",
    accountUrl: new URL("account.html", location.href).href,
    workdaysUrl: new URL("workdays.html", location.href).href,
    projectsUrl: new URL("projects.html", location.href).href,
    calculatorUrl: new URL("index.html", location.href).href
  });

  globalThis.OveruurtjeConfig = config;
})();
