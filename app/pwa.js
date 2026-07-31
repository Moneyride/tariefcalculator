(function initializePwa() {
  "use strict";

  const installButton = document.querySelector("#install-app");
  const installDialog = document.querySelector("#pwa-install-dialog");
  const installDialogCloseButtons = installDialog?.querySelectorAll("[data-pwa-dialog-close]") || [];
  const installInstructions = installDialog?.querySelector("[data-pwa-install-instructions]");
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const pushOnboardingKey = "overuurtje-push-onboarding-v1";
  let deferredInstallPrompt = null;
  let pushOnboardingTimer = null;
  let pushOnboardingPending = standalone;

  function showToast(message) {
    if (globalThis.OveruurtjeAnalytics?.showToast) {
      globalThis.OveruurtjeAnalytics.showToast(message);
      return;
    }

    const toast = document.querySelector("#site-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("visible"));
    window.setTimeout(() => {
      toast.classList.remove("visible");
      window.setTimeout(() => { toast.hidden = true; }, 200);
    }, 2400);
  }

  function setInstallButtonVisible(visible) {
    if (installButton) installButton.hidden = !visible || standalone;
  }

  function createPushOnboardingDialog() {
    let dialog = document.querySelector("#pwa-push-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog pwa-push-dialog";
    dialog.id = "pwa-push-dialog";
    dialog.setAttribute("aria-labelledby", "pwa-push-title");
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-pwa-push-later aria-label="Sluiten">&times;</button>
      <div class="pwa-push-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M10 21h4"></path>
        </svg>
      </div>
      <p class="dialog-eyebrow">Meldingen</p>
      <h2 id="pwa-push-title">Blijf op de hoogte</h2>
      <p>Ontvang een melding wanneer een vooraf ingestelde werkdag begint en wanneer gedeelde tijden worden bijgewerkt.</p>
      <p class="dialog-footnote">Je kunt meldingen later altijd wijzigen bij Account.</p>
      <div class="dialog-action-stack">
        <button class="saas-primary-button" type="button" data-pwa-push-enable>Meldingen inschakelen</button>
        <button class="saas-text-button" type="button" data-pwa-push-later>Niet nu</button>
      </div>
      <p class="saas-form-status" data-pwa-push-status aria-live="polite"></p>
    `;
    document.body.append(dialog);

    const dismiss = () => {
      localStorage.setItem(pushOnboardingKey, "dismissed");
      if (dialog.open) dialog.close();
    };
    dialog.querySelectorAll("[data-pwa-push-later]").forEach((button) => {
      button.addEventListener("click", dismiss);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dismiss();
    });
    dialog.querySelector("[data-pwa-push-enable]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = dialog.querySelector("[data-pwa-push-status]");
      button.disabled = true;
      if (status) status.textContent = "";
      try {
        await globalThis.OveruurtjePush.subscribe();
        localStorage.setItem(pushOnboardingKey, "enabled");
        if (dialog.open) dialog.close();
        showToast("Meldingen zijn ingeschakeld.");
      } catch (error) {
        if (status) status.textContent = error.message || "Meldingen konden niet worden ingeschakeld.";
        button.disabled = false;
      }
    });
    return dialog;
  }

  async function offerPushOnboarding() {
    if (!pushOnboardingPending || localStorage.getItem(pushOnboardingKey)) return;
    const pushService = globalThis.OveruurtjePush;
    const sessionUi = globalThis.OveruurtjeSessionUI;
    if (!pushService || !sessionUi) return;

    const context = await sessionUi.ready;
    if (!context?.auth?.user) return;

    const result = await pushService.inspect();
    if (result.state === "subscribed") {
      localStorage.setItem(pushOnboardingKey, "enabled");
      return;
    }
    if (["denied", "unsupported"].includes(result.state)) {
      localStorage.setItem(pushOnboardingKey, result.state);
      return;
    }
    if (!["prompt", "ready"].includes(result.state)) return;

    const openDialog = document.querySelector("dialog[open]");
    if (openDialog) {
      clearTimeout(pushOnboardingTimer);
      pushOnboardingTimer = window.setTimeout(offerPushOnboarding, 1200);
      return;
    }

    const dialog = createPushOnboardingDialog();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function schedulePushOnboarding() {
    clearTimeout(pushOnboardingTimer);
    pushOnboardingTimer = window.setTimeout(offerPushOnboarding, 900);
  }

  function openInstallInstructions() {
    if (!installDialog) return;
    if (installInstructions) {
      installInstructions.textContent = isIos
        ? "Tik in je browser op Delen en kies daarna ‘Zet op beginscherm’."
        : "Open het menu van je browser en kies ‘App installeren’ of ‘Toevoegen aan startscherm’.";
    }
    installDialog.showModal();
  }

  async function installApp() {
    if (!deferredInstallPrompt) {
      openInstallInstructions();
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    setInstallButtonVisible(false);
    if (choice.outcome === "accepted") showToast("Overuurtje wordt geïnstalleerd.");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButtonVisible(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstallButtonVisible(false);
    pushOnboardingPending = true;
    localStorage.removeItem(pushOnboardingKey);
    showToast("Overuurtje is als app geïnstalleerd.");
    schedulePushOnboarding();
  });

  installButton?.addEventListener("click", installApp);
  installDialogCloseButtons.forEach((button) => {
    button.addEventListener("click", () => installDialog.close());
  });
  installDialog?.addEventListener("click", (event) => {
    if (event.target === installDialog) installDialog.close();
  });

  if (isIos && !standalone) setInstallButtonVisible(true);
  document.documentElement.classList.toggle("is-pwa", standalone);
  if (standalone) {
    document.addEventListener("dblclick", (event) => {
      event.preventDefault();
    }, { passive: false });
  }
  if (standalone) schedulePushOnboarding();
  document.addEventListener("overuurtje:user-context", (event) => {
    if (event.detail?.auth?.user) schedulePushOnboarding();
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI), {
        scope: "./"
      }).catch(() => {
        // De calculator blijft zonder service worker volledig bruikbaar.
      });
    });
  }
})();
