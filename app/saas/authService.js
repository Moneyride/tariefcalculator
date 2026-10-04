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
  let subscribedClient = null;
  let authRevision = 0;

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
    if (!/[A-ZÀ-ÖØ-Þ]/.test(value) || !/\d/.test(value)) {
      return { valid: false, message: "Gebruik minimaal één hoofdletter en één cijfer." };
    }
    return { valid: true, message: "" };
  }

  function publish(nextState) {
    authRevision += 1;
    state = Object.freeze({ ...state, error: null, ...nextState, loading: false });
    listeners.forEach((listener) => listener(state));
    document.dispatchEvent(new CustomEvent("overuurtje:auth-state", { detail: state }));
    return state;
  }

  async function initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      const client = await supabaseService.getClient();
      if (!client) return publish({ available: false, user: null, session: null, recovery: false });

      // Subscribe before reading storage: a failed session restore must not
      // prevent a later successful sign-in from reaching the interface.
      if (subscribedClient !== client) {
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
        subscribedClient = client;
      }

      const revision = authRevision;
      const { data, error } = await client.auth.getSession();
      if (authRevision !== revision) return state;
      if (error) throw error;

      const recovery = Boolean(data.session) && (recoveryRequestedByUrl() || readRecoveryMarker());
      if (recovery) writeRecoveryMarker(true);
      return publish({
        available: true,
        session: data.session,
        user: data.session?.user || null,
        recovery
      });
    })().catch((error) => {
      initializationPromise = null;
      return publish({ available: false, error, user: null, session: null, recovery: false });
    });

    return initializationPromise;
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  async function withClient(callback) {
    await initialize();
    const client = await supabaseService.getClient();
    if (!client) throw new Error("Accounts zijn nog niet geconfigureerd.");
    return callback(client);
  }

  function signIn(email, password) {
    return withClient((client) => client.auth.signInWithPassword({ email, password }));
  }

  function signInWithProvider(provider) {
    const redirectTo = new URL(globalThis.location?.href || config.authAccountUrl);
    redirectTo.searchParams.delete("mode");
    redirectTo.searchParams.delete("password-reset");
    return withClient((client) => client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo.href }
    }));
  }

  function getMfaAssurance() {
    return withClient((client) => client.auth.mfa.getAuthenticatorAssuranceLevel());
  }

  function listMfaFactors() {
    return withClient((client) => client.auth.mfa.listFactors());
  }

  function enrollMfa() {
    return withClient((client) => client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Overuurtje"
    }));
  }

  function verifyMfa(factorId, code) {
    return withClient((client) => client.auth.mfa.challengeAndVerify({
      factorId,
      code: String(code || "").replace(/\D/g, "")
    }));
  }

  function unenrollMfa(factorId) {
    return withClient((client) => client.auth.mfa.unenroll({ factorId }));
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
    signInWithProvider,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
    getMfaAssurance,
    listMfaFactors,
    enrollMfa,
    verifyMfa,
    unenrollMfa,
    validatePassword
  });
})();
