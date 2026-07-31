(function initializeAuthService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const config = globalThis.OveruurtjeConfig;
  const listeners = new Set();
  const recoveryStorageKey = "overuurtjePasswordRecovery";
  let state = Object.freeze({
    available: false,
    loading: true,
    user: null,
    session: null,
    recovery: false
  });
  let initializationPromise = null;

  function readRecoveryMarker() {
    try {
      return globalThis.sessionStorage?.getItem(recoveryStorageKey) === "true";
    } catch {
      return false;
    }
  }

  function writeRecoveryMarker(active) {
    try {
      if (active) globalThis.sessionStorage?.setItem(recoveryStorageKey, "true");
      else globalThis.sessionStorage?.removeItem(recoveryStorageKey);
    } catch {
      // Storage can be unavailable in strict privacy modes; the current URL still protects the initial view.
    }
  }

  function recoveryRequestedByUrl() {
    try {
      return new URL(globalThis.location?.href || config.authAccountUrl).searchParams.get("mode") === "reset";
    } catch {
      return false;
    }
  }

  function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 8) {
      return { valid: false, message: "Gebruik minimaal 8 tekens." };
    }
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value) || !/\d/.test(value)) {
      return { valid: false, message: "Gebruik minimaal één letter en één cijfer." };
    }
    return { valid: true, message: "" };
  }

  function publish(nextState) {
    state = Object.freeze({ ...state, ...nextState, loading: false });
    listeners.forEach((listener) => listener(state));
    document.dispatchEvent(new CustomEvent("overuurtje:auth-state", { detail: state }));
    return state;
  }

  async function initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      const client = await supabaseService.getClient();
      if (!client) return publish({ available: false, user: null, session: null, recovery: false });

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") writeRecoveryMarker(true);
        if (event === "SIGNED_OUT") writeRecoveryMarker(false);
        publish({
          available: true,
          session,
          user: session?.user || null,
          recovery: event === "PASSWORD_RECOVERY" || (Boolean(session) && readRecoveryMarker())
        });
      });

      const recovery = Boolean(data.session) && (recoveryRequestedByUrl() || readRecoveryMarker());
      if (recovery) writeRecoveryMarker(true);
      return publish({
        available: true,
        session: data.session,
        user: data.session?.user || null,
        recovery
      });
    })().catch((error) => publish({
      available: false,
      error,
      user: null,
      session: null,
      recovery: false
    }));

    return initializationPromise;
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  async function withClient(callback) {
    const client = await supabaseService.getClient();
    if (!client) throw new Error("Accounts zijn nog niet geconfigureerd.");
    return callback(client);
  }

  function signIn(email, password) {
    return withClient((client) => client.auth.signInWithPassword({ email, password }));
  }

  function signUp(email, password, displayName) {
    const currentUrl = new URL(location.href);
    const inviteToken = currentUrl.searchParams.get("invite");
    const emailRedirect = new URL(inviteToken ? config.authWorkdaysUrl : config.authAccountUrl);
    if (inviteToken) emailRedirect.searchParams.set("invite", inviteToken);

    return withClient((client) => client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirect.href,
        data: { display_name: String(displayName || "").trim() }
      }
    }));
  }

  async function signOut() {
    const response = await withClient((client) => client.auth.signOut());
    if (!response?.error) writeRecoveryMarker(false);
    return response;
  }

  function requestPasswordReset(email) {
    const redirectTo = new URL(config.authAccountUrl);
    redirectTo.searchParams.set("mode", "reset");
    return withClient((client) => client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.href }));
  }

  function updatePassword(password) {
    return withClient((client) => client.auth.updateUser({ password }));
  }

  globalThis.OveruurtjeAuth = Object.freeze({
    initialize,
    ready: initialize(),
    subscribe,
    getState: () => state,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
    validatePassword
  });
})();
