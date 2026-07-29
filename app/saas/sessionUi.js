(function initializeSessionUi() {
  "use strict";

  const auth = globalThis.OveruurtjeAuth;
  const profiles = globalThis.OveruurtjeProfiles;
  const subscriptions = globalThis.OveruurtjeSubscriptions;
  const shares = globalThis.OveruurtjeShares;
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
  let dashboardLink = document.querySelector("#dashboard-page-link");
  const accountLink = document.querySelector("#account-page-link");
  const workdaysLink = document.querySelector("#workdays-page-link");
  const projectsLink = document.querySelector("#projects-page-link");
  const logoutButtons = document.querySelectorAll("[data-auth-logout]");
  const authDialog = document.querySelector("#auth-dialog");
  const authForm = document.querySelector("#auth-form");
  const authTitle = document.querySelector("#auth-title");
  const authIntro = document.querySelector("#auth-intro");
  const authEmail = document.querySelector("#auth-email");
  const authName = document.querySelector("#auth-name");
  const authNameField = document.querySelector("#auth-name-field");
  const authPassword = document.querySelector("#auth-password");
  const authPasswordField = document.querySelector("#auth-password-field");
  const authSubmit = document.querySelector("#auth-submit");
  const authSwitch = document.querySelector("#auth-switch");
  const authForgot = document.querySelector("#auth-forgot");
  const authStatus = document.querySelector("#auth-status");
  const proDialog = document.querySelector("#pro-dialog");
  const proEyebrow = document.querySelector("#pro-eyebrow");
  const proTitle = document.querySelector("#pro-title");
  const proIntro = document.querySelector("#pro-intro");
  const proCheckout = document.querySelector("#pro-checkout");
  const proContinue = document.querySelector("#pro-continue-free");
  const upgradeButtons = document.querySelectorAll("[data-subscription-upgrade]");
  const manageButtons = document.querySelectorAll("[data-subscription-manage]");
  let authMode = "login";
  let showProChoiceAfterAuth = false;
  let authPurpose = "";
  let pendingSignupEmail = "";
  let notificationTimer = null;
  let notificationUi = null;
  let notificationPromptTimer = null;
  let pendingNotificationPrompt = null;

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

  function authErrorText(error, mode = "login") {
    const messageCandidates = [
      typeof error === "string" ? error : "",
      error?.message,
      error?.error_description,
      error?.msg
    ];
    const rawMessage = messageCandidates
      .find((value) => typeof value === "string" && value.trim() && !["{}", "[object Object]"].includes(value.trim()))
      ?.trim() || "";
    const code = String(error?.code || "").trim();
    const fingerprint = `${code} ${rawMessage}`.toLowerCase();

    if (fingerprint.includes("over_email_send_rate_limit") || fingerprint.includes("email rate limit")) {
      return "Er zijn te veel e-mails aangevraagd. Wacht een paar minuten en probeer het opnieuw.";
    }
    if (fingerprint.includes("signup_disabled")) {
      return "Nieuwe accounts zijn tijdelijk uitgeschakeld.";
    }
    if (fingerprint.includes("user_already_exists") || fingerprint.includes("already registered")) {
      return "Er bestaat al een account met dit e-mailadres. Kies 'Ik heb al een account'.";
    }
    if (fingerprint.includes("email_address_invalid") || fingerprint.includes("invalid email")) {
      return "Vul een geldig e-mailadres in.";
    }
    if (fingerprint.includes("weak_password") || fingerprint.includes("password should be")) {
      return "Kies een sterker wachtwoord van minimaal 8 tekens.";
    }
    if (
      fingerprint.includes("error sending confirmation email")
      || fingerprint.includes("email_send_failed")
      || fingerprint.includes("failed to send")
    ) {
      return "De bevestigingsmail kon niet worden verstuurd. Probeer het later opnieuw.";
    }
    if (rawMessage) return rawMessage;
    if (mode === "register") return "Account aanmaken is niet gelukt. Probeer het later opnieuw.";
    if (mode === "forgot") return "De herstellink kon niet worden verstuurd. Probeer het later opnieuw.";
    return "Inloggen is niet gelukt. Controleer je gegevens en probeer het opnieuw.";
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

  function notificationText(item) {
    if (item.type === "workday_start_owner") return "Je vooraf ingestelde werkdag begint nu.";
    if (item.type === "workday_started") return `${item.actorName} begint nu aan de gedeelde werkdag.`;
    if (item.type === "workday_completed") return `${item.actorName} heeft de eindtijd vastgelegd.`;
    if (item.type === "workday_times_updated") return `${item.actorName} heeft de werktijden aangepast.`;
    if (item.type === "workday_share_removed") return "Een gedeelde werkdag is niet langer beschikbaar.";
    return `${item.actorName} heeft een werkdag met je gedeeld.`;
  }

  function notificationHref(item) {
    if (item.shareId) return `${config.workdaysUrl}?shared=${encodeURIComponent(item.shareId)}`;
    if (item.sourceType === "workday" && item.sourceId) {
      return `${config.calculatorUrl}?workday=${encodeURIComponent(item.sourceId)}`;
    }
    if (item.sourceType === "project_day") return config.projectsUrl;
    return "";
  }

  function ensureNotificationPrompt() {
    let dialog = document.querySelector("#notification-alert-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog notification-alert-dialog";
    dialog.id = "notification-alert-dialog";
    dialog.setAttribute("aria-labelledby", "notification-alert-title");
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-notification-alert-close aria-label="Sluiten">&times;</button>
      <div class="notification-alert-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M10 21h4"></path>
        </svg>
      </div>
      <p class="dialog-eyebrow">Nieuw bericht</p>
      <h2 id="notification-alert-title">Je hebt een nieuw bericht</h2>
      <p class="notification-alert-copy"></p>
      <div class="notification-alert-actions">
        <button class="saas-primary-button" type="button" data-notification-alert-open>Bekijk bericht</button>
        <button class="saas-text-button" type="button" data-notification-alert-close>Later</button>
      </div>
    `;
    document.body.append(dialog);
    dialog.querySelectorAll("[data-notification-alert-close]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(dialog));
    });
    dialog.querySelector("[data-notification-alert-open]")?.addEventListener("click", () => {
      const item = pendingNotificationPrompt;
      closeDialog(dialog);
      const href = item ? notificationHref(item) : "";
      if (href) {
        location.href = href;
        return;
      }
      notificationUi?.querySelector(".notification-button")?.click();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    return dialog;
  }

  function maybeShowNotificationPrompt(items) {
    const newestUnread = items.find((item) => !item.readAt);
    if (!newestUnread || pendingNotificationPrompt?.id === newestUnread.id) return;
    const promptKey = `overuurtjeNotificationPrompt:${newestUnread.id}`;
    if (sessionStorage.getItem(promptKey)) return;

    clearTimeout(notificationPromptTimer);
    notificationPromptTimer = setTimeout(() => {
      const otherDialog = [...document.querySelectorAll("dialog[open]")]
        .some((dialog) => dialog.id !== "notification-alert-dialog");
      if (otherDialog) {
        pendingNotificationPrompt = null;
        maybeShowNotificationPrompt(items);
        return;
      }
      pendingNotificationPrompt = newestUnread;
      sessionStorage.setItem(promptKey, "shown");
      const dialog = ensureNotificationPrompt();
      dialog.querySelector(".notification-alert-copy").textContent = notificationText(newestUnread);
      openDialog(dialog);
      dialog.querySelector("[data-notification-alert-open]")?.focus();
    }, 700);
  }

  function ensureNotificationUi() {
    if (notificationUi || !userMenu?.parentElement || !shares) return notificationUi;
    const wrapper = document.createElement("div");
    wrapper.className = "notification-menu";
    wrapper.hidden = true;
    wrapper.innerHTML = `
      <button class="notification-button" type="button" aria-label="Notificaties" aria-expanded="false">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M10 21h4"></path>
        </svg>
        <span class="notification-badge" hidden>0</span>
      </button>
      <div class="notification-panel" hidden>
        <div class="notification-panel-heading"><strong>Notificaties</strong><button type="button">Alles gelezen</button></div>
        <div class="notification-list"></div>
      </div>
    `;
    userMenu.parentElement.insertBefore(wrapper, userMenu);
    const button = wrapper.querySelector(".notification-button");
    const panel = wrapper.querySelector(".notification-panel");
    button.addEventListener("click", async () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
      if (opening) {
        await refreshNotifications();
        await shares.markNotificationsRead().catch(() => {});
        wrapper.querySelector(".notification-badge").hidden = true;
      }
    });
    wrapper.querySelector(".notification-panel-heading button").addEventListener("click", async () => {
      await shares.markNotificationsRead();
      await refreshNotifications();
    });
    notificationUi = wrapper;
    return wrapper;
  }

  async function refreshNotifications() {
    if (!auth.getState().user || !shares) return;
    const wrapper = ensureNotificationUi();
    if (!wrapper) return;
    try {
      const items = await shares.listNotifications();
      const badge = wrapper.querySelector(".notification-badge");
      const unread = items.filter((item) => !item.readAt).length;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.hidden = unread === 0;
      maybeShowNotificationPrompt(items);
      const list = wrapper.querySelector(".notification-list");
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "notification-empty";
        empty.textContent = "Nog geen notificaties.";
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...items.map((item) => {
        const href = notificationHref(item);
        const link = document.createElement(href ? "a" : "div");
        link.className = `notification-item${item.readAt ? "" : " is-unread"}`;
        if (href) link.href = href;
        const copy = document.createElement("span");
        copy.textContent = notificationText(item);
        const time = document.createElement("small");
        time.textContent = new Intl.DateTimeFormat("nl-NL", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
        }).format(new Date(item.createdAt));
        link.append(copy, time);
        return link;
      }));
    } catch (error) {
      console.warn("Notificaties konden niet worden geladen.", error);
    }
  }

  function updateNotificationAccess(user) {
    const wrapper = ensureNotificationUi();
    if (wrapper) wrapper.hidden = !user;
    clearInterval(notificationTimer);
    notificationTimer = null;
    if (!user || !shares) return;
    refreshNotifications();
    notificationTimer = setInterval(refreshNotifications, 60000);
  }

  function ensureSignupConfirmationDialog() {
    let dialog = document.querySelector("#signup-confirmation-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog signup-confirmation-dialog";
    dialog.id = "signup-confirmation-dialog";
    dialog.setAttribute("aria-labelledby", "signup-confirmation-title");
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-signup-confirmation-close aria-label="Sluiten">&times;</button>
      <div class="signup-confirmation-icon" aria-hidden="true">&#9993;</div>
      <p class="dialog-eyebrow">Account aangemaakt</p>
      <h2 id="signup-confirmation-title">Controleer je inbox</h2>
      <p class="signup-confirmation-copy">
        We hebben een bevestigingsmail gestuurd naar
        <strong id="signup-confirmation-email"></strong>.
        Bevestig eerst je e-mailadres en log daarna in.
      </p>
      <button class="saas-primary-button" id="signup-confirmation-login" type="button">Naar inloggen</button>
    `;
    document.body.append(dialog);

    dialog.querySelector("[data-signup-confirmation-close]")?.addEventListener("click", () => closeDialog(dialog));
    dialog.querySelector("#signup-confirmation-login")?.addEventListener("click", () => {
      closeDialog(dialog);
      openAuth("login");
      authEmail.value = pendingSignupEmail;
      authPassword.focus();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    return dialog;
  }

  function openSignupConfirmation(email) {
    pendingSignupEmail = email;
    const dialog = ensureSignupConfirmationDialog();
    dialog.querySelector("#signup-confirmation-email").textContent = email;
    closeDialog(authDialog);
    openDialog(dialog);
    dialog.querySelector("#signup-confirmation-login")?.focus();
  }

  function setAuthMode(mode) {
    authMode = ["login", "register", "forgot"].includes(mode) ? mode : "login";
    const isForgot = authMode === "forgot";
    const isRegister = authMode === "register";

    const isShareInvite = authPurpose === "share";
    authTitle.textContent = isForgot
      ? "Wachtwoord herstellen"
      : (isShareInvite
        ? (isRegister ? "Account maken om tijden te ontvangen" : "Inloggen om tijden te ontvangen")
        : (isRegister && showProChoiceAfterAuth ? "Account maken voor Pro" : (isRegister ? "Account maken" : "Inloggen")));
    authIntro.textContent = isForgot
      ? "We sturen een veilige herstellink naar je e-mailadres."
      : (isShareInvite
        ? "Log in of maak gratis een account. Daarna kun je de gedeelde tijden bekijken en overnemen."
        : (isRegister && showProChoiceAfterAuth
        ? "Voor Pro heb je eerst een gratis account nodig. Na het aanmelden kies je direct Pro of ga je verder met Free."
        : (isRegister ? "Maak een account om Overuurtje straks op al je apparaten te gebruiken." : "Log in bij je Overuurtje-account.")));
    authPasswordField.hidden = isForgot;
    authPassword.required = !isForgot;
    authPassword.autocomplete = isRegister ? "new-password" : "current-password";
    if (authNameField) authNameField.hidden = !isRegister;
    if (authName) authName.required = isRegister;
    authSubmit.textContent = isForgot
      ? "Stuur herstellink"
      : (isRegister && showProChoiceAfterAuth ? "Account maken en doorgaan" : (isRegister ? "Account maken" : "Inloggen"));
    authSwitch.textContent = isRegister ? "Ik heb al een account" : "Nieuw bij Overuurtje? Account maken";
    authSwitch.hidden = isForgot;
    authForgot.hidden = isForgot || isRegister;
    authStatus.textContent = "";
  }

  function openAuth(mode = "login", { continueToPro = false, purpose = "" } = {}) {
    if (!auth.getState().available && !globalThis.OveruurtjeSupabase.isConfigured()) {
      showToast("Accounts worden actief zodra Supabase is gekoppeld.");
      return;
    }
    showProChoiceAfterAuth = continueToPro;
    authPurpose = purpose;
    setAuthMode(mode);
    openDialog(authDialog);
    authEmail.focus();
  }

  function renderHeader(context) {
    if (!loginButton || !userMenu) return;
    const user = context.auth.user;
    if (!dashboardLink && userDropdown && accountLink) {
      dashboardLink = document.createElement("a");
      dashboardLink.id = "dashboard-page-link";
      dashboardLink.href = config.dashboardUrl;
      dashboardLink.setAttribute("role", "menuitem");
      dashboardLink.textContent = "Dashboard";
      userDropdown.insertBefore(dashboardLink, accountLink);
    }
    loginButton.hidden = Boolean(user);
    document.querySelectorAll(".account-navigation [data-subscription-upgrade]").forEach((button) => {
      button.hidden = Boolean(user);
    });
    userMenu.hidden = !user;
    updateNotificationAccess(user);
    if (!user) return;

    const label = context.profile?.displayName || user.email || "Account";
    userInitial.textContent = label.trim().charAt(0).toUpperCase() || "O";
    userMenuButton.setAttribute("aria-label", `Account van ${label}`);
    if (dashboardLink) dashboardLink.href = config.dashboardUrl;
    accountLink.href = config.accountUrl;
    if (workdaysLink) workdaysLink.href = config.workdaysUrl;
    if (projectsLink) projectsLink.href = config.projectsUrl;
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
        ? await auth.signUp(email, authPassword.value, authName?.value)
        : await auth.signIn(email, authPassword.value);
      if (response.error) throw response.error;

      if (authMode === "register" && !response.data?.session) {
        if (showProChoiceAfterAuth) sessionStorage.setItem("overuurtjePostSignupChoice", "true");
        authForm.reset();
        openSignupConfirmation(email);
        return;
      }

      const completedRegistration = authMode === "register";
      closeDialog(authDialog);
      authForm.reset();
      showToast(completedRegistration ? "Account aangemaakt." : "Je bent ingelogd.");
      if (showProChoiceAfterAuth || sessionStorage.getItem("overuurtjePostSignupChoice") === "true") {
        sessionStorage.removeItem("overuurtjePostSignupChoice");
        showProChoiceAfterAuth = false;
        openUpgrade({ accountReady: true });
      }
    } catch (error) {
      console.error("Supabase Auth-verzoek mislukt.", {
        code: error?.code || "",
        status: error?.status || "",
        message: error?.message || ""
      });
      authStatus.textContent = authErrorText(error, authMode);
    } finally {
      authSubmit.disabled = false;
    }
  }

  function openUpgrade({ accountReady = Boolean(auth.getState().user) } = {}) {
    proEyebrow.textContent = accountReady ? "Je account is klaar" : "Overuurtje Pro";
    proTitle.textContent = accountReady ? "Kies hoe je verdergaat" : "Meer rust in je administratie";
    proIntro.textContent = accountReady
      ? "Upgrade nu naar Pro of ga verder met het gratis account. Je kunt later altijd nog upgraden."
      : "Voor Pro heb je een account nodig. Na het aanmelden ga je direct verder met de upgrade.";
    proCheckout.textContent = accountReady ? "Upgrade naar Pro" : "Account maken en doorgaan";
    proContinue.hidden = !accountReady;
    openDialog(proDialog);
  }

  function startUpgrade() {
    if (!auth.getState().user) {
      closeDialog(proDialog);
      openAuth("register", { continueToPro: true });
      return;
    }
    if (!subscriptions.openCheckout()) {
      showToast("De Shopify-checkout wordt binnenkort gekoppeld.");
    }
  }

  function beginUpgrade() {
    if (auth.getState().user) startUpgrade();
    else openAuth("register", { continueToPro: true });
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
    if (notificationUi && !event.target.closest(".notification-menu")) {
      notificationUi.querySelector(".notification-panel").hidden = true;
      notificationUi.querySelector(".notification-button").setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("focus", refreshNotifications);
  document.addEventListener("overuurtje:shares-changed", refreshNotifications);

  logoutButtons.forEach((button) => button.addEventListener("click", async () => {
    const { error } = await auth.signOut();
    if (error) showToast(error.message);
    else showToast("Je bent uitgelogd.");
  }));
  upgradeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.subscriptionUpgrade === "signup") beginUpgrade();
    else if (button.dataset.subscriptionUpgrade === "direct") startUpgrade();
    else openUpgrade();
  }));
  manageButtons.forEach((button) => button.addEventListener("click", manageSubscription));
  proCheckout?.addEventListener("click", startUpgrade);
  proContinue?.addEventListener("click", () => closeDialog(proDialog));
  document.addEventListener("overuurtje:pro-required", openUpgrade);
  document.addEventListener("overuurtje:subscription-changed", () => buildContext(auth.getState()));
  document.addEventListener("overuurtje:profile-updated", (event) => {
    currentContext = Object.freeze({ ...currentContext, profile: event.detail });
    renderHeader(currentContext);
  });
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
