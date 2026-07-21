(function initializeAccountPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const auth = globalThis.OveruurtjeAuth;
  const settingsService = globalThis.OveruurtjeSettings;
  const subscriptions = globalThis.OveruurtjeSubscriptions;
  const unavailable = document.querySelector("#account-unavailable");
  const loggedOut = document.querySelector("#account-logged-out");
  const content = document.querySelector("#account-content");
  const email = document.querySelector("#account-email");
  const created = document.querySelector("#account-created");
  const planPill = document.querySelector("#account-plan-pill");
  const settingsForm = document.querySelector("#account-settings-form");
  const settingsStatus = document.querySelector("#account-settings-status");
  const passwordForm = document.querySelector("#password-form");
  const passwordStatus = document.querySelector("#password-status");
  const planTitle = document.querySelector("#subscription-plan-title");
  const planDescription = document.querySelector("#subscription-plan-description");
  const upgradeButton = document.querySelector("[data-subscription-upgrade]");
  const manageButton = document.querySelector("[data-subscription-manage]");
  const mockControl = document.querySelector("#mock-plan-control");
  const mockPlan = document.querySelector("#mock-plan");
  const roninRow = document.querySelector("#account-ronin-row");
  let currentContext = null;

  function setVisible(element, visible) {
    element.hidden = !visible;
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
  }

  function populateSettings(settings) {
    const values = settings || settingsService.defaults;
    Object.entries(values).forEach(([name, value]) => {
      const field = settingsForm.elements.namedItem(name);
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    });
    updateDepartmentFields();
  }

  function readSettings() {
    const data = new FormData(settingsForm);
    return {
      defaultDepartment: data.get("defaultDepartment") === "audio" ? "audio" : "camera",
      defaultHourlyRate: Number(data.get("defaultHourlyRate")) || 0,
      mileageRate: Number(data.get("mileageRate")) || 0,
      parkingEnabled: data.get("parkingEnabled") === "on",
      parkingDefaultAmount: Number(data.get("parkingDefaultAmount")) || 0,
      droneEnabled: data.get("droneEnabled") === "on",
      roninEnabled: data.get("roninEnabled") === "on"
    };
  }

  function updateDepartmentFields() {
    const isCamera = settingsForm.elements.namedItem("defaultDepartment").value === "camera";
    roninRow.hidden = !isCamera;
    if (!isCamera) settingsForm.elements.namedItem("roninEnabled").checked = false;
  }

  function renderSubscription(subscription) {
    const isPro = subscription.isPro;
    planPill.textContent = isPro ? "Pro" : "Free";
    planPill.classList.toggle("pro", isPro);
    planTitle.textContent = isPro ? "Overuurtje Pro" : "Overuurtje Free";
    planDescription.textContent = isPro
      ? "Je Pro-status is actief. Shopify blijft straks de bron voor abonnementswijzigingen."
      : "De calculator blijft gratis beschikbaar. Upgrade zodra je de toekomstige Pro-functies wilt gebruiken.";
    upgradeButton.hidden = isPro;
    manageButton.hidden = !isPro;
    mockControl.hidden = !subscriptions.canMock();
    if (subscriptions.canMock()) mockPlan.value = isPro ? "pro" : "free";
  }

  async function render(context) {
    currentContext = context;
    const authState = context.auth;
    setVisible(unavailable, !authState.loading && !authState.available);
    setVisible(loggedOut, authState.available && !authState.user);
    setVisible(content, Boolean(authState.user));
    if (!authState.user) return;

    email.textContent = authState.user.email || "-";
    created.textContent = formatDate(context.profile?.createdAt || authState.user.created_at);
    renderSubscription(context.subscription);

    try {
      const saved = await settingsService.load(authState.user.id);
      populateSettings(saved);
    } catch (error) {
      settingsStatus.textContent = error.message || "Instellingen konden niet worden geladen.";
      populateSettings(null);
    }

    if (new URLSearchParams(location.search).get("mode") === "reset") {
      passwordForm.elements.namedItem("password").focus();
    }
  }

  document.querySelector("#account-login-cta")?.addEventListener("click", () => sessionUi.openAuth("login"));
  settingsForm.addEventListener("change", updateDepartmentFields);
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!settingsForm.reportValidity() || !currentContext?.auth.user) return;
    settingsStatus.textContent = "Opslaan…";
    try {
      await settingsService.save(currentContext.auth.user.id, readSettings());
      settingsStatus.textContent = "Instellingen opgeslagen en gesynchroniseerd.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Opslaan is niet gelukt.";
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordForm.reportValidity()) return;
    passwordStatus.textContent = "Wijzigen…";
    const { error } = await auth.updatePassword(passwordForm.elements.namedItem("password").value);
    if (error) {
      passwordStatus.textContent = error.message;
      return;
    }
    passwordForm.reset();
    passwordStatus.textContent = "Wachtwoord gewijzigd.";
  });

  mockPlan.addEventListener("change", () => subscriptions.setMockPlan(mockPlan.value));
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  sessionUi.ready.then(render);
})();
