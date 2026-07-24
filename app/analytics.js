(function initializeOveruurtjeAnalytics() {
  "use strict";

  const MEASUREMENT_ID = "G-LF1MHS2NS9";
  const CONSENT_KEY = "overuurtjeAnalyticsConsentV1";
  const CONSENT_GRANTED = "granted";
  const CONSENT_DENIED = "denied";

  // Add future events here first. Only listed parameters can ever reach GA4.
  // Never add rates, prices, dates, times, free text or other personal input.
  const EVENT_PARAMETERS = Object.freeze({
    calculation_completed: [
      "department",
      "total_hours",
      "overtime_hours",
      "night_hours",
      "drone",
      "ronin",
      "mileage",
      "parking"
    ],
    department_selected: ["department"],
    drone_enabled: ["department"],
    ronin4d_enabled: ["department"],
    mileage_enabled: ["department"],
    parking_enabled: ["department"],
    settings_opened: [],
    share_clicked: ["method", "content_type"]
  });

  let consentChoice = readConsentChoice();
  let googleTagPromise = null;
  let toastTimer = null;

  function readConsentChoice() {
    try {
      const savedChoice = localStorage.getItem(CONSENT_KEY);
      return savedChoice === CONSENT_GRANTED || savedChoice === CONSENT_DENIED
        ? savedChoice
        : null;
    } catch {
      return null;
    }
  }

  function persistConsentChoice(choice) {
    try {
      localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      // Consent still applies for this page when storage is unavailable.
    }
  }

  function updateGoogleConsent(choice) {
    const analyticsState = choice === CONSENT_GRANTED ? "granted" : "denied";

    window.gtag("consent", "update", {
      analytics_storage: analyticsState,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }

  function shouldLoadGoogleTag() {
    return !["localhost", "127.0.0.1", "::1"].includes(location.hostname)
      && location.protocol !== "file:";
  }

  function loadGoogleTag() {
    if (googleTagPromise || !shouldLoadGoogleTag()) return googleTagPromise;

    googleTagPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
      script.dataset.overuurtjeAnalytics = "true";
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => reject(new Error("Google Analytics kon niet worden geladen.")), { once: true });
      document.head.append(script);
    });

    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    return googleTagPromise;
  }

  function clearAnalyticsCookies() {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) return;

      [location.hostname, `.${location.hostname}`].forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
      });
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    });
  }

  function filterParameters(eventName, parameters) {
    const allowedParameters = EVENT_PARAMETERS[eventName];
    if (!allowedParameters) return null;

    return Object.fromEntries(
      allowedParameters
        .filter((name) => Object.hasOwn(parameters, name))
        .map((name) => [name, parameters[name]])
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    );
  }

  function track(eventName, parameters = {}) {
    if (consentChoice !== CONSENT_GRANTED) return false;

    const safeParameters = filterParameters(eventName, parameters);
    if (!safeParameters) return false;

    window.gtag("event", eventName, safeParameters);
    return true;
  }

  function setBannerVisibility(visible) {
    const banner = document.querySelector("#cookie-banner");
    if (!banner) return;

    banner.hidden = !visible;
    if (visible) {
      banner.querySelector("button")?.focus({ preventScroll: true });
    }
  }

  function showToast(message) {
    const toast = document.querySelector("#site-toast");
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("visible"));

    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => {
        toast.hidden = true;
      }, 180);
    }, 2600);
  }

  function setConsent(choice) {
    const previousChoice = consentChoice;
    consentChoice = choice === CONSENT_GRANTED ? CONSENT_GRANTED : CONSENT_DENIED;
    persistConsentChoice(consentChoice);
    updateGoogleConsent(consentChoice);
    setBannerVisibility(false);

    if (consentChoice === CONSENT_GRANTED) {
      loadGoogleTag()?.catch(() => {
        showToast("Analytics kon niet worden geladen.");
      });
      showToast("Cookievoorkeur opgeslagen.");
      return;
    }

    clearAnalyticsCookies();
    showToast("Alleen noodzakelijke opslag actief.");

    // Reload after revocation so automatic GA4 listeners are removed as well.
    if (previousChoice === CONSENT_GRANTED && shouldLoadGoogleTag()) {
      setTimeout(() => location.reload(), 350);
    }
  }

  function bindConsentInterface() {
    const acceptButton = document.querySelector("#cookie-accept");
    const declineButton = document.querySelector("#cookie-decline");
    const settingsButton = document.querySelector("#cookie-settings");

    acceptButton?.addEventListener("click", () => setConsent(CONSENT_GRANTED));
    declineButton?.addEventListener("click", () => setConsent(CONSENT_DENIED));
    settingsButton?.addEventListener("click", () => setBannerVisibility(true));

    setBannerVisibility(consentChoice === null);
  }

  window.OveruurtjeAnalytics = Object.freeze({
    track,
    showToast,
    openCookieSettings: () => setBannerVisibility(true),
    hasConsent: () => consentChoice === CONSENT_GRANTED
  });

  if (consentChoice === CONSENT_GRANTED) {
    updateGoogleConsent(CONSENT_GRANTED);
    loadGoogleTag()?.catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindConsentInterface, { once: true });
  } else {
    bindConsentInterface();
  }
})();
