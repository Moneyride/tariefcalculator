(function initializeAccountAccounting() {
  "use strict";
  const service = globalThis.OveruurtjeAccounting;
  const sessionUi = globalThis.OveruurtjeSessionUI;
  let section;
  let context;

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
      <div class="accounting-provider-row"><div><strong>Moneybird</strong><p>Stuur werkdagen en projecten als gecontroleerde conceptfactuur.</p></div><span class="accounting-connection-state" data-accounting-state>Niet verbonden</span></div>
      <div class="accounting-administration" hidden><label><span>Administratie</span><select data-accounting-administration></select></label></div>
      <p class="saas-form-status" data-accounting-status aria-live="polite"></p>
      <div class="accounting-settings-actions">
        <button class="saas-primary-button" type="button" data-accounting-connect>Verbind Moneybird</button>
        <button class="saas-secondary-button" type="button" data-accounting-development hidden>Gebruik testadministratie</button>
        <button class="saas-secondary-button" type="button" data-accounting-test hidden>Verbinding testen</button>
        <button class="text-action" type="button" data-accounting-reconnect hidden>Opnieuw verbinden</button>
        <button class="text-action danger-text" type="button" data-accounting-disconnect hidden>Ontkoppelen</button>
      </div>`;
    document.querySelector(".subscription-section")?.before(section);
    section.querySelector("[data-accounting-connect]").addEventListener("click", connect);
    section.querySelector("[data-accounting-development]").addEventListener("click", connectDevelopment);
    section.querySelector("[data-accounting-reconnect]").addEventListener("click", connect);
    section.querySelector("[data-accounting-test]").addEventListener("click", test);
    section.querySelector("[data-accounting-disconnect]").addEventListener("click", disconnect);
    section.querySelector("[data-accounting-administration]").addEventListener("change", chooseAdministration);
    return section;
  }

  function setStatus(message) { ensureSection().querySelector("[data-accounting-status]").textContent = message || ""; }
  async function connect() {
    if (!context?.isPro) { document.dispatchEvent(new CustomEvent("overuurtje:pro-required", { detail: { feature: "accounting_export" } })); return; }
    setStatus("Moneybird openen…");
    try { location.href = (await service.startOAuth()).authorizationUrl; } catch (error) { setStatus(error.message); }
  }
  async function test() {
    setStatus("Verbinding controleren…");
    try { await service.validate(); setStatus("Moneybird-verbinding werkt."); } catch (error) { setStatus(error.message); }
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
    try { await service.disconnect(); await render(context); setStatus("Moneybird is ontkoppeld."); } catch (error) { setStatus(error.message); }
  }
  async function chooseAdministration(event) {
    try { await service.selectAdministration(event.target.value); setStatus("Administratie opgeslagen."); await render(context); } catch (error) { setStatus(error.message); }
  }
  async function render(nextContext) {
    context = nextContext;
    const root = ensureSection();
    root.classList.toggle("is-locked", !context?.isPro);
    root.querySelector("[data-accounting-connect]").textContent = context?.isPro ? "Verbind Moneybird" : "Moneybird met Pro";
    root.querySelector("[data-accounting-development]").hidden = location.hostname !== "localhost" || !context?.isPro;
    if (!context?.isPro) return;
    try {
      const connection = (await service.status()).connection;
      const connected = connection?.status === "connected";
      root.querySelector("[data-accounting-state]").textContent = connected ? "Verbonden" : "Niet verbonden";
      root.querySelector("[data-accounting-connect]").hidden = connected;
      root.querySelector("[data-accounting-development]").hidden = connected || location.hostname !== "localhost";
      root.querySelector("[data-accounting-test]").hidden = !connected;
      root.querySelector("[data-accounting-reconnect]").hidden = !connected;
      root.querySelector("[data-accounting-disconnect]").hidden = !connected;
      root.querySelector(".accounting-administration").hidden = !connected;
      if (connected) {
        const administrations = await service.administrations();
        const select = root.querySelector("[data-accounting-administration]");
        select.replaceChildren(new Option("Kies administratie", ""), ...administrations.administrations.map((item) => new Option(item.name, item.id)));
        select.value = connection.administration_id || connection.administrationId || "";
      }
      const callback = new URLSearchParams(location.search).get("accounting");
      if (callbackMessages[callback]) {
        setStatus(callbackMessages[callback]);
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete("accounting");
        history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
    } catch (error) { setStatus(error.message); }
  }
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  sessionUi.ready.then(render);
})();
