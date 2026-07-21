(function initializeSupabaseClient() {
  "use strict";

  const config = globalThis.OveruurtjeConfig;
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.js";
  let clientPromise = null;

  function isConfigured() {
    return Boolean(config?.supabaseUrl && config?.supabaseAnonKey);
  }

  function loadSdk() {
    if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);

    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-supabase-sdk]");
      if (existing) {
        existing.addEventListener("load", () => resolve(globalThis.supabase), { once: true });
        existing.addEventListener("error", () => reject(new Error("Supabase SDK kon niet worden geladen.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.dataset.supabaseSdk = "true";
      script.addEventListener("load", () => resolve(globalThis.supabase), { once: true });
      script.addEventListener("error", () => reject(new Error("Supabase SDK kon niet worden geladen.")), { once: true });
      document.head.append(script);
    });
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
    ));

    return clientPromise;
  }

  globalThis.OveruurtjeSupabase = Object.freeze({
    getClient,
    isConfigured
  });
})();
