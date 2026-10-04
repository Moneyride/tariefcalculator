(function initializeSupabaseClient() {
  "use strict";

  const config = globalThis.OveruurtjeConfig;
  // Official supabase-js 2.110.7, bundled with the PWA for offline session reads.
  const SDK_URL = new URL("vendor/supabase.js", config.calculatorUrl).href;
  let clientPromise = null;
  let sdkPromise = null;

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
