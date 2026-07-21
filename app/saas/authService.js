(function initializeAuthService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const config = globalThis.OveruurtjeConfig;
  const listeners = new Set();
  let state = Object.freeze({ available: false, loading: true, user: null, session: null });
  let initializationPromise = null;

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
      if (!client) return publish({ available: false, user: null, session: null });

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      client.auth.onAuthStateChange((_event, session) => {
        publish({ available: true, session, user: session?.user || null });
      });

      return publish({ available: true, session: data.session, user: data.session?.user || null });
    })().catch((error) => publish({ available: false, error, user: null, session: null }));

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

  function signUp(email, password) {
    return withClient((client) => client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: config.accountUrl }
    }));
  }

  function signOut() {
    return withClient((client) => client.auth.signOut());
  }

  function requestPasswordReset(email) {
    const redirectTo = new URL(config.accountUrl);
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
    updatePassword
  });
})();
