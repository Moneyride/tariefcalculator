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
  const guestAboutLinks = document.querySelectorAll("[data-guest-about]");
  const userMenu = document.querySelector("#account-user-menu");
  const userMenuButton = document.querySelector("#account-user-button");
  const userDropdown = document.querySelector("#account-dropdown");
  const userInitial = document.querySelector("#account-user-initial");
  const userAvatar = document.querySelector("#account-user-avatar");
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
  let recoveryDialog = null;
  let passwordResetNoticeHandled = false;
  let expiredTrialNoticeHandled = false;
  let mfaVerificationPromise = null;
  let socialAuthActions = null;

  function revealSessionUi() {
    document.documentElement.classList.remove("auth-pending");
    document.documentElement.classList.add("auth-ready");
  }

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
      return "Gebruik minimaal 8 tekens, met minstens één hoofdletter en één cijfer.";
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

  function ensurePasswordRequirements() {
    if (!authPasswordField) return null;
    let help = authPasswordField.querySelector(".password-requirements");
    if (help) return help;
    help = document.createElement("small");
    help.className = "password-requirements";
    help.textContent = "Gebruik minimaal 8 tekens, met minstens één hoofdletter en één cijfer.";
    authPasswordField.append(help);
    return help;
  }

  function ensurePasswordRecoveryDialog() {
    if (recoveryDialog) return recoveryDialog;
    recoveryDialog = document.createElement("dialog");
    recoveryDialog.className = "saas-dialog password-recovery-dialog";
    recoveryDialog.id = "password-recovery-dialog";
    recoveryDialog.setAttribute("aria-labelledby", "password-recovery-title");
    recoveryDialog.innerHTML = `
      <p class="dialog-eyebrow">Accountbeveiliging</p>
      <h2 id="password-recovery-title">Nieuw wachtwoord instellen</h2>
      <p>Je herstel-link is gecontroleerd. Kies nu eerst een nieuw wachtwoord voordat je verdergaat.</p>
      <form class="password-recovery-form">
        <label>
          <span>Nieuw wachtwoord</span>
          <input name="password" type="password" autocomplete="new-password" minlength="8" required>
          <small class="password-requirements">Gebruik minimaal 8 tekens, met minstens één hoofdletter en één cijfer.</small>
        </label>
        <label>
          <span>Herhaal nieuw wachtwoord</span>
          <input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="8" required>
        </label>
        <p class="password-recovery-status" aria-live="polite"></p>
        <button class="saas-primary-button" type="submit">Wachtwoord opslaan</button>
      </form>
    `;
    document.body.append(recoveryDialog);
    recoveryDialog.addEventListener("cancel", (event) => event.preventDefault());
    recoveryDialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const password = form.elements.namedItem("password");
      const passwordConfirmation = form.elements.namedItem("passwordConfirmation");
      const status = form.querySelector(".password-recovery-status");
      const submit = form.querySelector("button[type='submit']");
      const validation = auth.validatePassword(password.value);
      if (!validation.valid) {
        status.textContent = validation.message;
        password.focus();
        return;
      }
      if (password.value !== passwordConfirmation.value) {
        status.textContent = "De wachtwoorden zijn niet hetzelfde.";
        passwordConfirmation.focus();
        return;
      }

      submit.disabled = true;
      status.textContent = "Wachtwoord opslaan…";
      try {
        const { error } = await auth.updatePassword(password.value);
        if (error) throw error;
        const { error: signOutError } = await auth.signOut();
        if (signOutError) throw signOutError;
        const destination = new URL(config.accountUrl);
        destination.searchParams.set("password-reset", "success");
        location.replace(destination.href);
      } catch (error) {
        status.textContent = authErrorText(error, "reset");
        submit.disabled = false;
      }
    });
    return recoveryDialog;
  }

  function ensureSocialAuthActions() {
    if (socialAuthActions || !authForm) return socialAuthActions;
    socialAuthActions = document.createElement("div");
    socialAuthActions.className = "auth-social-actions";
    socialAuthActions.innerHTML = `
      <div class="auth-social-divider"><span>of</span></div>
      <button class="auth-social-button" type="button" data-auth-provider="google">
        <svg class="auth-provider-logo" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-4z"/>
          <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-4z"/>
        </svg>
        <span>Doorgaan met Google</span>
      </button>
      <button class="auth-social-button" type="button" data-auth-provider="facebook">
        <svg class="auth-provider-logo" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#1877F2" d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.008 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.49 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          <path fill="#FFF" d="m16.671 15.542.532-3.47h-3.328v-2.25c0-.949.466-1.874 1.956-1.874h1.513V4.995s-1.374-.235-2.686-.235c-2.741 0-4.533 1.661-4.533 4.669v2.643H7.078v3.47h3.047v8.385a12.13 12.13 0 0 0 3.75 0v-8.385h2.796z"/>
        </svg>
        <span>Doorgaan met Facebook</span>
      </button>
    `;
    authForm.insertAdjacentElement("afterend", socialAuthActions);
    socialAuthActions.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-auth-provider]");
      if (!button) return;
      button.disabled = true;
      authStatus.textContent = "Veilige login openen…";
      const { error } = await auth.signInWithProvider(button.dataset.authProvider);
      if (error) {
        authStatus.textContent = authErrorText(error, "login");
        button.disabled = false;
      }
    });
    return socialAuthActions;
  }

  function ensureMfaChallengeDialog() {
    let dialog = document.querySelector("#mfa-challenge-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog mfa-challenge-dialog";
    dialog.id = "mfa-challenge-dialog";
    dialog.innerHTML = `
      <p class="dialog-eyebrow">Accountbeveiliging</p>
      <h2>Bevestig dat jij het bent</h2>
      <p>Vul de zescijferige code uit je authenticator-app in.</p>
      <form>
        <input class="mfa-code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" aria-label="Verificatiecode" required>
        <p class="saas-form-status" aria-live="polite"></p>
        <div class="mfa-dialog-actions">
          <button class="saas-primary-button" type="submit">Bevestigen</button>
          <button class="text-action" type="button" data-mfa-logout>Uitloggen</button>
        </div>
      </form>
    `;
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    return dialog;
  }

  async function requireMfaVerification() {
    if (mfaVerificationPromise) return mfaVerificationPromise;
    mfaVerificationPromise = (async () => {
      const [assuranceResponse, factorsResponse] = await Promise.all([
        auth.getMfaAssurance(),
        auth.listMfaFactors()
      ]);
      if (assuranceResponse.error) throw assuranceResponse.error;
      if (factorsResponse.error) throw factorsResponse.error;
      const assurance = assuranceResponse.data;
      const factor = factorsResponse.data?.totp?.find((item) => item.status === "verified");
      if (!factor || assurance?.currentLevel === "aal2" || assurance?.nextLevel !== "aal2") return true;

      const dialog = ensureMfaChallengeDialog();
      const form = dialog.querySelector("form");
      const status = dialog.querySelector(".saas-form-status");
      const code = form.elements.namedItem("code");
      code.value = "";
      status.textContent = "";
      openDialog(dialog);
      code.focus();

      return new Promise((resolve) => {
        const submit = async (event) => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          const button = form.querySelector("button[type='submit']");
          button.disabled = true;
          status.textContent = "Controleren…";
          const response = await auth.verifyMfa(factor.id, code.value);
          if (response.error) {
            status.textContent = "De code klopt niet of is verlopen.";
            button.disabled = false;
            code.select();
            return;
          }
          form.removeEventListener("submit", submit);
          closeDialog(dialog);
          button.disabled = false;
          resolve(true);
        };
        const logout = async () => {
          form.removeEventListener("submit", submit);
          await auth.signOut();
          closeDialog(dialog);
          resolve(false);
        };
        form.addEventListener("submit", submit);
        dialog.querySelector("[data-mfa-logout]").onclick = logout;
      });
    })().finally(() => { mfaVerificationPromise = null; });
    return mfaVerificationPromise;
  }

  function handlePasswordRecovery(authState) {
    if (!authState.recovery || !authState.session) return;
    const dialog = ensurePasswordRecoveryDialog();
    if (!dialog.open) openDialog(dialog);
    dialog.querySelector("input")?.focus();
  }

  function handlePasswordResetNotice(authState) {
    if (passwordResetNoticeHandled || authState.loading || authState.user) return;
    const currentUrl = new URL(location.href);
    if (currentUrl.searchParams.get("password-reset") !== "success") return;
    passwordResetNoticeHandled = true;
    currentUrl.searchParams.delete("password-reset");
    history.replaceState({}, "", currentUrl.href);
    showToast("Je wachtwoord is gewijzigd. Log opnieuw in.");
    openAuth("login");
  }

  function notificationText(item) {
    if (item.type === "badge_earned") return "Je hebt een nieuwe badge behaald. Bekijk hem op je Crew Card.";
    if (item.type === "trial_ending") return "Je gratis Pro-periode eindigt over 7 dagen. Je gegevens blijven bewaard als je teruggaat naar Free.";
    if (item.type === "trial_expired") return "Je gratis Pro-periode is afgelopen. Je account is teruggezet naar Free en je gegevens zijn bewaard.";
    if (item.type === "workday_share_joined") return `${item.actorName} doet mee met je gedeelde werkdag.`;
    if (item.type === "workday_start_owner") return "Je vooraf ingestelde werkdag begint nu.";
    if (item.type === "workday_started") return `${item.actorName} begint nu aan de gedeelde werkdag.`;
    if (item.type === "workday_overtime_soon") return "Over 15 minuten beginnen de overuren van deze werkdag.";
    if (item.type === "workday_night_soon") return "Over 15 minuten begint de ingestelde nachtperiode.";
    if (item.type === "push_test") return "Je testmelding is aangekomen. Web Push werkt op dit apparaat.";
    if (item.type === "workday_completed") return `${item.actorName} heeft de eindtijd vastgelegd.`;
    if (item.type === "workday_resumed") return `${item.actorName} heeft de gedeelde werkdag opnieuw live gezet.`;
    if (item.type === "workday_times_updated") return `${item.actorName} heeft de werktijden aangepast.`;
    if (item.type === "workday_share_removed") return "Een gedeelde werkdag is niet langer beschikbaar.";
    return `${item.actorName} heeft een werkdag met je gedeeld.`;
  }

  function notificationCategory(item) {
    const passiveTypes = new Set([
      "workday_start_owner",
      "workday_started",
      "workday_overtime_soon",
      "workday_night_soon",
      "workday_times_updated",
      "push_test"
    ]);
    return passiveTypes.has(item?.type) ? "notification-only" : "important";
  }

  function notificationHref(item) {
    if (item.type === "badge_earned") return config.dashboardUrl;
    if (["trial_ending", "trial_expired"].includes(item.type)) return config.accountUrl;
    if (item.type === "workday_share_joined" && item.sourceType === "workday" && item.sourceId) {
      return `${config.calculatorUrl}?workday=${encodeURIComponent(item.sourceId)}`;
    }
    if (item.type === "workday_share_joined" && item.sourceType === "project_day") {
      return config.projectsUrl;
    }
    if (item.shareId) return `${config.calculatorUrl}?shared=${encodeURIComponent(item.shareId)}`;
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
    const newestUnread = items.find((item) => !item.readAt && notificationCategory(item) === "important");
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
      if (["trial_ending", "trial_expired"].includes(newestUnread.type)) {
        shares?.markNotificationsRead([newestUnread.id]).catch(() => {});
        if (newestUnread.type === "trial_expired" && !expiredTrialNoticeHandled) {
          expiredTrialNoticeHandled = true;
          profiles.markTrialExpiredNoticeShown(auth.getState().user).catch(() => {});
        }
      }
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
      <p class="dialog-eyebrow">30 dagen gratis Pro</p>
      <h2 id="signup-confirmation-title">Controleer je inbox</h2>
      <p class="signup-confirmation-copy">
        We hebben een bevestigingsmail gestuurd naar
        <strong id="signup-confirmation-email"></strong>.
        Bevestig eerst je e-mailadres en log daarna in. Je Pro-proefperiode is dan actief;
        er zijn geen betaalgegevens nodig en er wordt niets automatisch afgeschreven.
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
        : (isRegister ? "Start 30 dagen gratis Pro" : "Inloggen"));
    authIntro.textContent = isForgot
      ? "We sturen een veilige herstellink naar je e-mailadres."
      : (isShareInvite
        ? "Log in of maak gratis een account. Daarna kun je de gedeelde tijden bekijken en overnemen."
        : (isRegister
          ? "Maak gratis een account aan en probeer Overuurtje Pro 30 dagen. Geen betaalgegevens nodig; daarna kies je zelf of je wilt upgraden."
          : "Log in bij je Overuurtje-account."));
    authPasswordField.hidden = isForgot;
    authPassword.required = !isForgot;
    authPassword.autocomplete = isRegister ? "new-password" : "current-password";
    authPassword.title = isRegister
      ? "Gebruik minimaal 8 tekens, met minstens één hoofdletter en één cijfer."
      : "";
    const passwordRequirements = ensurePasswordRequirements();
    if (passwordRequirements) passwordRequirements.hidden = !isRegister;
    if (authNameField) authNameField.hidden = !isRegister;
    if (authName) authName.required = isRegister;
    authSubmit.textContent = isForgot
      ? "Stuur herstellink"
      : (isRegister ? "Start 30 dagen gratis Pro" : "Inloggen");
    authSwitch.textContent = isRegister ? "Ik heb al een account" : "Nieuw bij Overuurtje? Account maken";
    authSwitch.hidden = isForgot;
    authForgot.hidden = isForgot || isRegister;
    authStatus.textContent = "";
    const socialActions = ensureSocialAuthActions();
    if (socialActions) socialActions.hidden = isForgot;
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
      dashboardLink.textContent = "Crew Card";
      userDropdown.insertBefore(dashboardLink, accountLink);
    }
    loginButton.hidden = Boolean(user);
    guestAboutLinks.forEach((link) => {
      link.hidden = Boolean(user);
    });
    document.querySelectorAll(".account-navigation [data-subscription-upgrade]").forEach((button) => {
      button.hidden = Boolean(user);
    });
    userMenu.hidden = !user;
    updateNotificationAccess(user);
    if (!user) return;

    const label = context.profile?.displayName || user.email || "Account";
    userInitial.textContent = label.trim().charAt(0).toUpperCase() || "O";
    const avatarUrl = String(context.profile?.avatarUrl || "").trim();
    if (userAvatar) {
      userAvatar.hidden = !avatarUrl;
      userInitial.hidden = Boolean(avatarUrl);
      if (avatarUrl) {
        userAvatar.src = avatarUrl;
        userAvatar.alt = `Profielfoto van ${label}`;
      } else {
        userAvatar.removeAttribute("src");
        userAvatar.alt = "";
      }
    }
    userMenuButton.setAttribute("aria-label", `Account van ${label}`);
    if (dashboardLink) dashboardLink.href = config.dashboardUrl;
    accountLink.href = config.accountUrl;
    if (workdaysLink) workdaysLink.href = config.workdaysUrl;
    if (projectsLink) projectsLink.href = config.projectsUrl;
  }

  async function buildContext(authState) {
    handlePasswordRecovery(authState);
    handlePasswordResetNotice(authState);
    if (authState.user && !authState.recovery) {
      try {
        const verified = await requireMfaVerification();
        if (!verified) return currentContext;
      } catch (error) {
        console.warn("Tweestapsverificatie kon niet worden gecontroleerd.", error);
      }
    }
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
    revealSessionUi();

    if (authState.user) {
      // Push recovery may use the network, but it must never delay the
      // visible account session while navigating between pages.
      globalThis.OveruurtjePush?.refresh?.().catch((error) => {
        console.warn("Pushabonnement kon niet opnieuw worden gekoppeld.", error);
      });
    }

    if (
      authState.user
      && subscription.isExpiredTrial
      && !profile?.trialExpiredNoticeShownAt
      && !expiredTrialNoticeHandled
    ) {
      expiredTrialNoticeHandled = true;
      setTimeout(() => {
        showToast("Je gratis Pro-periode is afgelopen. Je account is teruggezet naar Free; je gegevens zijn bewaard.");
        profiles.markTrialExpiredNoticeShown(authState.user).catch(() => {});
      }, 500);
    }

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

      if (authMode === "register") {
        const validation = auth.validatePassword(authPassword.value);
        if (!validation.valid) {
          authStatus.textContent = validation.message;
          authPassword.focus();
          return;
        }
      }

      response = authMode === "register"
        ? await auth.signUp(email, authPassword.value, authName?.value)
        : await auth.signIn(email, authPassword.value);
      if (response.error) throw response.error;

      if (authMode === "register" && !response.data?.session) {
        authForm.reset();
        openSignupConfirmation(email);
        return;
      }

      const completedRegistration = authMode === "register";
      closeDialog(authDialog);
      authForm.reset();
      showToast(completedRegistration ? "Account aangemaakt. Je Pro-proefperiode is gestart." : "Je bent ingelogd.");
      showProChoiceAfterAuth = false;
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
    const subscription = currentContext.subscription;
    if (!accountReady) {
      proEyebrow.textContent = "30 dagen gratis Pro";
      proTitle.textContent = "Probeer Overuurtje Pro gratis";
      proIntro.textContent = "Maak een gratis account aan. Je hebt geen betaalgegevens nodig en na 30 dagen kies je zelf of je wilt upgraden.";
      proCheckout.textContent = "Start 30 dagen gratis Pro";
      proContinue.hidden = true;
    } else if (subscription.isTrial) {
      proEyebrow.textContent = "Pro-proefperiode actief";
      proTitle.textContent = "Behoud Pro na je proefperiode";
      proIntro.textContent = `Je gebruikt Pro gratis tot en met ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(subscription.trialEndsAt))}. Alleen als je zelf upgradet start een betaald abonnement.`;
      proCheckout.textContent = "Behoud Pro";
      proContinue.hidden = false;
    } else {
      proEyebrow.textContent = subscription.isExpiredTrial ? "Pro-proefperiode afgelopen" : "Overuurtje Pro";
      proTitle.textContent = subscription.isExpiredTrial ? "Activeer Pro opnieuw" : "Meer rust in je administratie";
      proIntro.textContent = subscription.isExpiredTrial
        ? "Je account is teruggezet naar Free. Je opgeslagen gegevens zijn bewaard en worden weer volledig beschikbaar zodra je upgradet."
        : "Upgrade naar Pro wanneer je de extra functies wilt gebruiken. Alleen jij start de betaling.";
      proCheckout.textContent = "Upgrade naar Pro";
      proContinue.hidden = false;
    }
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
  document.addEventListener("overuurtje:badges-earned", refreshNotifications);
  document.addEventListener("overuurtje:badges-updated", refreshNotifications);

  logoutButtons.forEach((button) => button.addEventListener("click", async () => {
    try {
      await globalThis.OveruurtjePush?.detach?.();
    } catch (pushError) {
      console.warn("Pushabonnement kon niet van het account worden losgekoppeld.", pushError);
    }
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
  auth.subscribe((authState) => {
    // The first synchronous state only means that stored auth is being read.
    // Rendering it as a guest causes a visible guest-to-account flash.
    if (authState.loading) return;
    buildContext(authState);
  });

  globalThis.OveruurtjeSessionUI = Object.freeze({
    ready,
    openAuth,
    openUpgrade,
    getContext: () => currentContext,
    refresh: () => buildContext(auth.getState()),
    showToast,
    requireMfaVerification
  });
})();
