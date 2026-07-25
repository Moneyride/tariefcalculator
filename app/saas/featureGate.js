(function initializeFeatureGate() {
  "use strict";

  const features = Object.freeze({
    workdays: { requiresPro: true },
    projects: { requiresPro: true },
    custom_equipment: { requiresPro: true },
    equipment_library: { requiresPro: true },
    work_functions: { requiresPro: true },
    workday_sharing: { requiresPro: true },
    pdf_export: { requiresPro: true },
    device_sync: { requiresPro: true }
  });

  function canUse(featureName, user) {
    const feature = features[featureName];
    if (!feature) return false;
    return !feature.requiresPro || Boolean(user?.isPro);
  }

  function requireFeature(featureName, user, onAllowed) {
    if (canUse(featureName, user)) {
      onAllowed?.();
      return true;
    }

    document.dispatchEvent(new CustomEvent("overuurtje:pro-required", {
      detail: { feature: featureName }
    }));
    return false;
  }

  // Add future premium capabilities to the registry above, then call
  // OveruurtjeFeatureGate.require(featureName, currentUser, callback).
  globalThis.OveruurtjeFeatureGate = Object.freeze({ features, canUse, require: requireFeature });
})();
