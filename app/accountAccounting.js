(function initializeAccountAccounting() {
  "use strict";
  const service = globalThis.OveruurtjeAccounting;
  const sessionUi = globalThis.OveruurtjeSessionUI;
  let section;
  let context;
  let connection = null;

  const callbackMessages = {
    "moneybird-connected": "Moneybird is verbonden. Kies eventueel nog je administratie.",
    "moneybird-error": "Moneybird verbinden is niet gelukt. Probeer het opnieuw.",
    "moneybird-state-expired": "De Moneybird-aanvraag is verlopen. Start de koppeling opnieuw."
  };

  function ensureSection() {
    if (section) return section;
    section = document.createElement("section");
    section.className = "account-section accounting-settings-section";
    section.id = "accounting-settings";
    section.innerHTML = `
      <div class="account-section-heading"><div><p class="account-section-kicker">Integraties</p><h2>Boekhouding</h2></div><span class="accounting-pro-pill">Pro</span></div>
      <div class="accounting-provider-choice">
        <label><span>Boekhoudsysteem</span><select data-accounting-provider><option value="">Kies boekhoudsysteem</option><option value="moneybird">Moneybird</option></select></label>
        <p>Maak gecontroleerde conceptfacturen vanuit je werkdagen en projecten.</p>
      </div>
      <div class="accounting-provider-details" data-accounting-provider-details hidden>
        <div class="accounting-provider-row"><strong data-accounting-provider-name>Moneybird</strong><span class="accounting-connection-state" data-accounting-state>Niet verbonden</span></div>
        <div class="accounting-administration" hidden><label><span>Administratie</span><select data-accounting-administration></select></label></div>
        <p class="saas-form-status" data-accounting-status aria-live="polite"></p>
        <div class="accounting-settings-actions">
          <button class="saas-primary-button" type="button" data-accounting-connect>Verbind Moneybird</button>
          <button class="saas-secondary-button" type="button" data-accounting-development hidden>Gebruik testadministratie</button>
          <button class="text-action" type="button" data-accounting-reconnect hidden>Opnieuw verbinden</button>
          <button class="text-action danger-text" type="button" data-accounting-disconnect hidden>Ontkoppelen</button>
        </div>
      </div>`;
    document.querySelector(".subscription-section")?.before(section);
    section.querySelector("[data-accounting-provider]").addEventListener("change", renderProviderChoice);
    section.querySelector("[data-accounting-connect]").addEventListener("click", connect);
    section.querySelector("[data-accounting-development]").addEventListener("click", connectDevelopment);
    section.querySelector("[data-accounting-reconnect]").addEventListener("click", connect);
    section.querySelector("[data-accounting-disconnect]").addEventListener("click", disconnect);
    section.querySelector("[data-accounting-administration]").addEventListener("change", chooseAdministration);
    return section;
  }

  function isReady() {
    return connection?.status === "connected" && Boolean(connection.administration_id || connection.administrationId);
  }

  function announceConnection() {
    document.dispatchEvent(new CustomEvent("overuurtje:accounting-connection", {
      detail: { provider: connection?.provider || "", ready: isReady() }
    }));
  }

  function setStatus(message) {
    ensureSection().querySelector("[data-accounting-status]").textContent = message || "";
  }

  function renderProviderChoice() {
    const root = ensureSection();
    const provider = root.querySelector("[data-accounting-provider]").value;
    root.querySelector("[data-accounting-provider-details]").hidden = provider !== "moneybird";
    if (provider !== "moneybird") setStatus("");
  }

  async function connect() {
    if (!context?.isPro) {
      document.dispatchEvent(new CustomEvent("overuurtje:pro-required", { detail: { feature: "accounting_export" } }));
      return;
    }
    const root = ensureSection();
    if (root.querySelector("[data-accounting-provider]").value !== "moneybird") return;
    const button = root.querySelector("[data-accounting-connect]");
    button.disabled = true;
    setStatus("Moneybird openen…");
    try {
      const authorizationUrl = (await service.startOAuth()).authorizationUrl;
      if (!authorizationUrl) throw new Error("Moneybird gaf geen geldige verbindingslink terug.");
      location.assign(authorizationUrl);
    } catch (error) {
      setStatus(error.message);
      button.disabled = false;
    }
  }

  async function connectDevelopment() {
    if (!context?.isPro) return;
    setStatus("Moneybird-testadministratie verbinden…");
    try {
      await service.connectDevelopment();
      await render(context);
      setStatus("Moneybird-testadministratie is verbonden.");
    } catch (error) { setStatus(error.message); }
  }

  async function disconnect() {
    if (!confirm("Moneybird ontkoppelen? Bestaande conceptfacturen blijven in Moneybird staan.")) return;
    try {
      await service.disconnect();
      connection = null;
      ensureSection().querySelector("[data-accounting-provider]").value = "";
      await render(context);
      setStatus("");
    } catch (error) { setStatus(error.message); }
  }

  async function chooseAdministration(event) {
    try {
      const result = await service.selectAdministration(event.target.value);
      connection = result.connection;
      setStatus("Administratie opgeslagen.");
      await render(context);
    } catch (error) { setStatus(error.message); }
  }

  async function render(nextContext) {
    context = nextContext;
    const root = ensureSection();
    const providerSelect = root.querySelector("[data-accounting-provider]");
    root.classList.toggle("is-locked", !context?.isPro);
    providerSelect.disabled = !context?.isPro;
    if (!context?.isPro) {
      providerSelect.value = "";
      connection = null;
      renderProviderChoice();
      announceConnection();
      return;
    }
    try {
      const bootstrap = await service.settingsBootstrap();
      connection = bootstrap.connection;
      const connected = connection?.status === "connected";
      if (connected) providerSelect.value = connection.provider || "moneybird";
      renderProviderChoice();
      root.querySelector("[data-accounting-state]").textContent = connected ? "Verbonden" : "Niet verbonden";
      root.querySelector("[data-accounting-connect]").hidden = connected;
      root.querySelector("[data-accounting-connect]").disabled = false;
      root.querySelector("[data-accounting-development]").hidden = connected || location.hostname !== "localhost";
      root.querySelector("[data-accounting-reconnect]").hidden = !connected;
      root.querySelector("[data-accounting-disconnect]").hidden = !connected;
      root.querySelector(".accounting-administration").hidden = !connected;
      if (connected) {
        const select = root.querySelector("[data-accounting-administration]");
        select.replaceChildren(new Option("Kies administratie", ""), ...bootstrap.administrations.map((item) => new Option(item.name, item.id)));
        select.value = connection.administration_id || connection.administrationId || "";
      }
      announceConnection();
      const callback = new URLSearchParams(location.search).get("accounting");
      if (callbackMessages[callback]) {
        setStatus(callbackMessages[callback]);
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete("accounting");
        history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
    } catch (error) {
      connection = null;
      announceConnection();
      setStatus(error.message);
    }
  }

  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  sessionUi.ready.then(render);
})();
