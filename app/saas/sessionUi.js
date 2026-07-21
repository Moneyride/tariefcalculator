(function initializeSessionUi() {
  "use strict";

  const auth = globalThis.OveruurtjeAuth;
  const profiles = globalThis.OveruurtjeProfiles;
  const subscriptions = globalThis.OveruurtjeSubscriptions;
  const config = globalThis.OveruurtjeConfig;
  let currentContext = Object.freeze({ auth: auth.getState(), profile: null, subscription: subscriptions.resolve(null), isPro: false });
  let contextPromiseResolve;
  const ready = new Promise((resolve) => { contextPromiseResolve = resolve; });
  let hasResolvedReady = false;

  const loginButton = document.querySelector("#account-login");
  const userMenu = document.querySelector("#account-user-menu");
  const userMenuButton = document.querySelector("#account-user-button");
  const userDropdown = document.querySelector("#account-dropdown");
  const userInitial = document.querySelector("#account-user-initial");
  const accountLink = document.querySelector("#account-page-link");
  const settingsLink = document.querySelector("#account-settings-link");
  const logoutButtons = document.querySelectorAll("[data-auth-logout]");
  const authDialog = document.querySelector("#auth-dialog");
  const authForm = document.querySelector("#auth-form");
  const authTitle = document.querySelector("#auth-title");
  const authIntro = document.querySelector("#auth-intro");
  const authEmail = document.querySelector("#auth-email");
  const authPassword = document.querySelector("#auth-password");
  const authPasswordField = document.querySelector("#auth-password-field");
  const authSubmit = document.querySelector("#auth-submit");
  const authSwitch = document.querySelector("#auth-switch");
  const authForgot = document.querySelector("#auth-forgot");
  const authStatus = document.querySelector("#auth-status");
  const proDialog = document.querySelector("#pro-dialog");
  const upgradeButtons = document.querySelectorAll("[data-subscription-upgrade]");
  const manageButtons = document.querySelectorAll("[data-subscription-manage]");
  let authMode = "login";

  function showToast(message) {
    if (globalThis.OveruurtjeAnalytics?.showToast) {
      globalThis.OveruurtjeAnalytics.showToast(message);
      return;
    }
    const toast = document.querySelector("#site-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("visible");
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function setAuthMode(mode) {
    authMode = ["login", "register", "forgot"].includes(mode) ? mode : "login";
    const isForgot = authMode === "forgot";
    const isRegister = authMode === "register";

    authTitle.textContent = isForgot ? "Wachtwoord herstellen" : (isRegister ? "Account maken" : "Inloggen");
    authIntro.textContent = isForgot
      ? "We sturen een veilige herstellink naar je e-mailadres."
      : (isRegister ? "Maak een account om Overuurtje straks op al je apparaten te gebruiken." : "Log in bij je Overuurtje-account.");
    authPasswordField.hidden = isForgot;
    authPassword.required = !isForgot;
    authPassword.autocomplete = isRegister ? "new-password" : "current-password";
    authSubmit.textContent = isForgot ? "Stuur herstellink" : (isRegister ? "Account maken" : "Inloggen");
    authSwitch.textContent = isRegister ? "Ik heb al een account" : "Nieuw bij Overuurtje? Account maken";
    authSwitch.hidden = isForgot;
    authForgot.hidden = isForgot || isRegister;
    authStatus.textContent = "";
  }

  function openAuth(mode = "login") {
    if (!auth.getState().available && !globalThis.OveruurtjeSupabase.isConfigured()) {
      showToast("Accounts worden actief zodra Supabase is gekoppeld.");
      return;
    }
    setAuthMode(mode);
    openDialog(authDialog);
    authEmail.focus();
  }

  function renderHeader(context) {
    if (!loginButton || !userMenu) return;
    const user = context.auth.user;
    loginButton.hidden = Boolean(user);
    userMenu.hidden = !user;
    if (!user) return;

    const label = context.profile?.displayName || user.email || "Account";
    userInitial.textContent = label.trim().charAt(0).toUpperCase() || "O";
    userMenuButton.setAttribute("aria-label", `Account van ${label}`);
    accountLink.href = config.accountUrl;
    settingsLink.href = `${config.accountUrl}#calculator-settings`;
  }

  async function buildContext(authState) {
    let profile = null;
    if (authState.user) {
      try {
        profile = await profiles.getForUser(authState.user);
      } catch (error) {
        console.warn("Profiel kon niet worden geladen.", error);
      }
    }

    const subscription = subscriptions.resolve(profile);
    currentContext = Object.freeze({
      auth: authState,
      profile,
      subscription,
      isPro: subscription.isPro
    });
    renderHeader(currentContext);
    document.dispatchEvent(new CustomEvent("overuurtje:user-context", { detail: currentContext }));

    if (!hasResolvedReady && !authState.loading) {
      hasResolvedReady = true;
      contextPromiseResolve(currentContext);
    }
    return currentContext;
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!authForm.reportValidity()) return;
    authSubmit.disabled = true;
    authStatus.textContent = "Even geduld…";

    try {
      const email = authEmail.value.trim();
      let response;
      if (authMode === "forgot") {
        response = await auth.requestPasswordReset(email);
        if (response.error) throw response.error;
        authStatus.textContent = "De herstellink is verstuurd.";
        return;
      }

      response = authMode === "register"
        ? await auth.signUp(email, authPassword.value)
        : await auth.signIn(email, authPassword.value);
      if (response.error) throw response.error;

      if (authMode === "register" && !response.data.session) {
        authStatus.textContent = "Controleer je e-mail om je account te bevestigen.";
        return;
      }

      closeDialog(authDialog);
      authForm.reset();
      showToast(authMode === "register" ? "Account aangemaakt." : "Je bent ingelogd.");
    } catch (error) {
      authStatus.textContent = error.message || "Inloggen is niet gelukt.";
    } finally {
      authSubmit.disabled = false;
    }
  }

  function openUpgrade() {
    openDialog(proDialog);
  }

  function startUpgrade() {
    if (!subscriptions.openCheckout()) {
      showToast("De Shopify-checkout wordt binnenkort gekoppeld.");
    }
  }

  function manageSubscription() {
    if (!subscriptions.openManagement()) {
      showToast("Abonnementenbeheer wordt binnenkort gekoppeld.");
    }
  }

  loginButton?.addEventListener("click", () => openAuth("login"));
  authForm?.addEventListener("submit", submitAuth);
  authSwitch?.addEventListener("click", () => setAuthMode(authMode === "register" ? "login" : "register"));
  authForgot?.addEventListener("click", () => setAuthMode("forgot"));
  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });
  authDialog?.addEventListener("click", (event) => {
    if (event.target === authDialog) closeDialog(authDialog);
  });
  proDialog?.addEventListener("click", (event) => {
    if (event.target === proDialog) closeDialog(proDialog);
  });

  userMenuButton?.addEventListener("click", () => {
    const isOpen = !userDropdown.hidden;
    userDropdown.hidden = isOpen;
    userMenuButton.setAttribute("aria-expanded", String(!isOpen));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#account-user-menu") && userDropdown) {
      userDropdown.hidden = true;
      userMenuButton?.setAttribute("aria-expanded", "false");
    }
  });

  logoutButtons.forEach((button) => button.addEventListener("click", async () => {
    const { error } = await auth.signOut();
    if (error) showToast(error.message);
    else showToast("Je bent uitgelogd.");
  }));
  upgradeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.subscriptionUpgrade === "direct") startUpgrade();
    else openUpgrade();
  }));
  manageButtons.forEach((button) => button.addEventListener("click", manageSubscription));
  document.querySelector("#pro-checkout")?.addEventListener("click", startUpgrade);
  document.addEventListener("overuurtje:pro-required", openUpgrade);
  document.addEventListener("overuurtje:subscription-changed", () => buildContext(auth.getState()));
  auth.subscribe(buildContext);

  globalThis.OveruurtjeSessionUI = Object.freeze({
    ready,
    openAuth,
    openUpgrade,
    getContext: () => currentContext,
    refresh: () => buildContext(auth.getState()),
    showToast
  });
})();
