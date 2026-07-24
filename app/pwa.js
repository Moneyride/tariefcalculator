(function initializePwa() {
  "use strict";

  const installButton = document.querySelector("#install-app");
  const installDialog = document.querySelector("#pwa-install-dialog");
  const installDialogCloseButtons = installDialog?.querySelectorAll("[data-pwa-dialog-close]") || [];
  const installInstructions = installDialog?.querySelector("[data-pwa-install-instructions]");
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredInstallPrompt = null;

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
    showToast("Overuurtje is als app geïnstalleerd.");
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
