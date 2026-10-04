(function initializeSupabaseClient() {
  "use strict";

  const config = globalThis.OveruurtjeConfig;
  // Official supabase-js 2.110.7, bundled with the PWA for offline session reads.
  const SDK_URL = new URL("vendor/supabase.js", config.calculatorUrl).href;
  let clientPromise = null;
  let sdkPromise = null;
  let clockRecoveryWait = null;

  async function fetchWithClockRecovery(input, options) {
    const request = new Request(input, options);
    const retry = request.clone();
    const response = await globalThis.fetch(request);
    const url = new URL(request.url);
    if (url.origin !== new URL(config.supabaseUrl).origin
      || !url.pathname.startsWith("/rest/v1/") || response.status !== 401) return response;
    let error;
    try { error = await response.clone().json(); } catch { return response; }
    if (error.code !== "PGRST303" || !/JWT issued at future/i.test(error.message || "")) return response;
    // Authentication rejected this request before any database operation ran.
    // Keep the same token and retry once; refreshing would issue a newer token.
    if (!clockRecoveryWait) {
      clockRecoveryWait = new Promise(resolve => setTimeout(resolve, 1500)).finally(() => {
        clockRecoveryWait = null;
      });
    }
    await clockRecoveryWait;
    if (request.signal.aborted) return response;
    return globalThis.fetch(retry);
  }

  function isConfigured() {
    return Boolean(config?.supabaseUrl && config?.supabaseAnonKey);
  }

  function loadSdk() {
    if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let timer;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("De inlogmodule kon niet worden geladen. Probeer het opnieuw."));
      };
      script.src = SDK_URL;
      script.async = true;
      script.dataset.supabaseSdk = "true";
      script.addEventListener("load", () => {
        if (!globalThis.supabase?.createClient) return fail();
        clearTimeout(timer);
        resolve(globalThis.supabase);
      }, { once: true });
      script.addEventListener("error", fail, { once: true });
      timer = setTimeout(fail, 12000);
      document.head.append(script);
    }).catch((error) => {
      sdkPromise = null;
      throw error;
    });
    return sdkPromise;
  }

  async function getClient() {
    if (!isConfigured()) return null;
    if (clientPromise) return clientPromise;

    clientPromise = loadSdk().then((sdk) => sdk.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        global: { fetch: fetchWithClockRecovery },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "overuurtje-auth"
        }
      }
    )).catch((error) => {
      clientPromise = null;
      throw error;
    });

    return clientPromise;
  }

  globalThis.OveruurtjeSupabase = Object.freeze({
    getClient,
    isConfigured
  });
})();
