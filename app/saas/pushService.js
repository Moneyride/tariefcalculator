(function initializePushService() {
  "use strict";

  const config = globalThis.OveruurtjeConfig;
  const supabaseService = globalThis.OveruurtjeSupabase;

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  function isSupported() {
    return Boolean(
      window.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window
    );
  }

  function decodePublicKey(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function database() {
    const value = await supabaseService.getClient();
    if (!value) throw new Error("Supabase is niet beschikbaar.");
    return value;
  }

  async function registration() {
    const existing = await navigator.serviceWorker.getRegistration("./");
    if (existing) return existing;
    return navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI), {
      scope: "./"
    });
  }

  async function currentSubscription() {
    if (!isSupported()) return null;
    const worker = await navigator.serviceWorker.getRegistration("./");
    return worker ? worker.pushManager.getSubscription() : null;
  }

  async function saveSubscription(subscription) {
    const json = subscription.toJSON();
    const db = await database();
    const { error } = await db.rpc("upsert_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: json.keys?.p256dh || "",
      p_auth: json.keys?.auth || "",
      p_user_agent: navigator.userAgent.slice(0, 500)
    });
    if (error) throw error;
  }

  async function inspect() {
    if (!isSupported()) return { state: "unsupported", subscription: null };
    if (isIos() && !isStandalone()) return { state: "ios-install-required", subscription: null };
    if (!config.vapidPublicKey) return { state: "unconfigured", subscription: null };
    if (Notification.permission === "denied") return { state: "denied", subscription: null };

    const subscription = await currentSubscription();
    if (subscription) return { state: "subscribed", subscription };
    if (Notification.permission === "granted") return { state: "ready", subscription: null };
    return { state: "prompt", subscription: null };
  }

  async function subscribe() {
    if (!isSupported()) throw new Error("Meldingen worden op dit apparaat niet ondersteund.");
    if (isIos() && !isStandalone()) {
      throw new Error("Zet Overuurtje eerst op je beginscherm en schakel meldingen daarna in vanuit de app.");
    }
    if (!config.vapidPublicKey) throw new Error("Web Push is nog niet geconfigureerd.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Meldingen zijn niet toegestaan. Pas dit aan in de instellingen van je apparaat.");
    }

    const worker = await registration();
    const subscription = await worker.pushManager.getSubscription()
      || await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(config.vapidPublicKey)
      });
    await saveSubscription(subscription);
    return subscription;
  }

  async function unsubscribe() {
    const subscription = await currentSubscription();
    if (!subscription) return;

    const db = await database();
    const { error } = await db.rpc("remove_push_subscription", {
      p_endpoint: subscription.endpoint
    });
    if (error) throw error;
    await subscription.unsubscribe();
  }

  async function refresh() {
    const subscription = await currentSubscription();
    if (subscription) await saveSubscription(subscription);
    return subscription;
  }

  globalThis.OveruurtjePush = Object.freeze({
    inspect,
    subscribe,
    unsubscribe,
    refresh,
    isSupported
  });
})();
