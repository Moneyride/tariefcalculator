(function initializeAccountingUi() {
  "use strict";

  const service = globalThis.OveruurtjeAccounting;
  const exportTools = globalThis.OveruurtjeAccountingExport;
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  let dialog;
  let originalModel;
  let connection;
  let options;
  let currentContext;
  let exportHistory = { exports: [], items: [] };
  let reexportKey = crypto.randomUUID();
  let selectedContact = null;
  let resolvedTaxRate = null;

  function providerName() {
    return connection?.provider === "moneybird" ? "Moneybird" : "je boekhoudsysteem";
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog accounting-dialog";
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-accounting-close aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Boekhouding</p>
      <h2>Controleer conceptfactuur</h2>
      <p class="accounting-dialog-intro">Controleer de regels. Overuurtje maakt alleen een conceptfactuur; verzenden doe je zelf in je boekhoudsysteem.</p>
      <form class="accounting-preview-form">
        <div class="accounting-preview-meta">
          <label class="accounting-contact-field"><span>Opdrachtgever</span><input name="contactSearch" type="search" placeholder="Zoek opdrachtgever" autocomplete="off"><div class="accounting-contact-suggestions" data-accounting-contact-suggestions hidden></div></label>
          <label><span>Factuurdatum</span><input name="invoiceDate" type="date" required></label>
        </div>
        <fieldset class="accounting-source-selection" hidden><legend>Projectdagen</legend><div data-accounting-sources></div></fieldset>
        <div class="accounting-lines"></div>
        <div class="accounting-mappings"></div>
        <div class="accounting-preview-total"><span>Totaal excl. btw</span><strong></strong></div>
        <label class="accounting-reexport" hidden><input type="checkbox" name="confirmReexport"><span>Bewust opnieuw exporteren naar een nieuw concept</span></label>
        <p class="saas-form-status" aria-live="polite"></p>
        <button class="saas-primary-button" type="submit">Maak conceptfactuur</button>
      </form>`;
    document.body.append(dialog);
    dialog.querySelector("[data-accounting-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.querySelector("input[name='contactSearch']").addEventListener("input", debounce(loadContacts, 300));
    dialog.querySelector("[data-accounting-contact-suggestions]").addEventListener("click", chooseContactSuggestion);
    dialog.querySelector("[data-accounting-sources]").addEventListener("change", refreshPreview);
    dialog.querySelector("form").addEventListener("submit", createDraft);
    return dialog;
  }

  function close() {
    dialog?.close();
    document.documentElement.classList.remove("dialog-open");
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function status(message) { ensureDialog().querySelector(".saas-form-status").textContent = message || ""; }
  function createdExportIds() {
    const created = new Set((exportHistory.exports || []).filter((item) => item.status === "created").map((item) => item.id));
    return new Set((exportHistory.items || []).filter((item) => created.has(item.export_id)).map((item) => item.source_id));
  }

  function selectedModel() {
    if (originalModel.sourceType !== "project") return originalModel;
    const ids = Array.from(dialog.querySelectorAll("[data-accounting-source]:checked"), (input) => input.value);
    return exportTools.withSourceItems(originalModel, ids);
  }

  function renderSources() {
    const fieldset = dialog.querySelector(".accounting-source-selection");
    fieldset.hidden = originalModel.sourceType !== "project";
    if (fieldset.hidden) return;
    const exported = createdExportIds();
    const root = dialog.querySelector("[data-accounting-sources]");
    root.replaceChildren(...originalModel.sourceItems.map((item) => {
      const label = document.createElement("label");
      const wasExported = exported.has(item.sourceId);
      const line = originalModel.lineItems.find((entry) => entry.source?.sourceId === item.sourceId);
      label.className = wasExported ? "is-exported" : "";
      label.innerHTML = `<input type="checkbox" data-accounting-source value="${item.sourceId}" ${wasExported ? "" : "checked"}><span>${line?.description?.replace(/^.*?–\s*/, "") || "Projectdag"}</span>${wasExported ? "<small>Geëxporteerd ✓</small>" : ""}`;
      return label;
    }));
  }

  async function loadContacts() {
    const input = dialog.querySelector("input[name='contactSearch']");
    const query = input.value.trim();
    const suggestions = dialog.querySelector("[data-accounting-contact-suggestions]");
    selectedContact = selectedContact?.name === query ? selectedContact : null;
    if (query.length < 2) {
      suggestions.replaceChildren();
      suggestions.hidden = true;
      return;
    }
    const result = await service.contacts(query);
    suggestions.replaceChildren(...result.contacts.map((contact) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.contactId = contact.id;
      button.dataset.contactName = contact.name;
      button.textContent = `${contact.name}${contact.email ? ` · ${contact.email}` : ""}`;
      return button;
    }));
    suggestions.hidden = result.contacts.length === 0;
  }

  function chooseContactSuggestion(event) {
    const button = event.target.closest("[data-contact-id]");
    if (!button) return;
    selectedContact = { id: button.dataset.contactId, name: button.dataset.contactName };
    dialog.querySelector("input[name='contactSearch']").value = selectedContact.name;
    const suggestions = dialog.querySelector("[data-accounting-contact-suggestions]");
    suggestions.replaceChildren();
    suggestions.hidden = true;
  }

  function selectMappedContact(mapped) {
    if (!mapped) return;
    selectedContact = {
      id: mapped.external_contact_id,
      name: mapped.external_contact_name || originalModel.customer.name
    };
    dialog.querySelector("input[name='contactSearch']").value = selectedContact.name;
  }

  function renderLines() {
    const model = selectedModel();
    const root = dialog.querySelector(".accounting-lines");
    root.innerHTML = `<div class="accounting-line accounting-line-head"><span>Omschrijving</span><span>Aantal</span><span>Prijs</span><span>Btw</span><span>Bedrag</span></div>`;
    model.lineItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "accounting-line";
      row.innerHTML = `<span></span><span></span><span></span><span></span><strong></strong>`;
      row.children[0].textContent = item.description;
      row.children[1].textContent = `${item.quantity.toLocaleString("nl-NL")} ${item.unit}`;
      row.children[2].textContent = euro.format(item.unitPrice);
      row.children[3].textContent = `${item.vatPercentage}%`;
      row.children[4].textContent = euro.format(item.lineTotal);
      root.append(row);
    });
    dialog.querySelector(".accounting-preview-total strong").textContent = euro.format(model.lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  }

  async function renderMappings() {
    const model = selectedModel();
    const [savedTaxes, savedLedgers] = await Promise.all([service.taxMappings(), service.ledgerMappings()]);
    const categories = [...new Set(model.lineItems.map((item) => item.category))];
    const root = dialog.querySelector(".accounting-mappings");
    root.innerHTML = `<h3>Boekhoudkoppelingen</h3>`;
    const savedTax = savedTaxes.find((item) => Number(item.local_tax_percentage) === 21);
    resolvedTaxRate = options.taxRates.find((tax) => tax.id === savedTax?.external_tax_rate_id)
      || options.taxRates.find((tax) => Number(tax.percentage) === 21 && tax.taxRateType === "sales_invoice")
      || options.taxRates.find((tax) => Number(tax.percentage) === 21)
      || null;
    categories.forEach((category) => {
      const name = model.lineItems.find((item) => item.category === category)?.description || category;
      const label = document.createElement("label");
      label.innerHTML = `<span>Grootboek · ${name}</span><select data-ledger="${category}" required><option value="">Kies grootboekrekening</option></select>`;
      const select = label.querySelector("select");
      options.ledgerAccounts.forEach((ledger) => select.add(new Option(ledger.name, ledger.id)));
      select.value = savedLedgers.find((item) => item.category === category)?.external_ledger_account_id || "";
      root.append(label);
    });
  }

  function renderReexportState() {
    const selected = selectedModel().sourceItems.map((item) => item.sourceId);
    const hasExported = selected.some((id) => createdExportIds().has(id));
    const label = dialog.querySelector(".accounting-reexport");
    label.hidden = !hasExported;
    if (!hasExported) label.querySelector("input").checked = false;
  }

  async function refreshPreview() {
    renderLines();
    renderReexportState();
    await renderMappings();
  }

  async function createDraft(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const activeModel = selectedModel();
    if (!activeModel.sourceItems.length || !activeModel.lineItems.length) { status("Selecteer minimaal één projectdag."); return; }
    const mustConfirmReexport = !form.elements.confirmReexport.closest("label").hidden;
    if (mustConfirmReexport && !form.elements.confirmReexport.checked) { status("Bevestig dat je de reeds geëxporteerde dag opnieuw wilt meenemen."); return; }
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    status("Conceptfactuur aanmaken…");
    try {
      if (!selectedContact) throw new Error("Kies eerst een opdrachtgever uit de suggesties.");
      if (!resolvedTaxRate) throw new Error("Geen geldig btw-tarief van 21% gevonden. Controleer de instellingen van je boekhoudsysteem.");
      const taxMappings = { "21": resolvedTaxRate.id };
      const ledgerMappings = {};
      const saves = [service.saveTaxMapping({ connection_id: connection.id, local_tax_percentage: 21, external_tax_rate_id: resolvedTaxRate.id, external_tax_rate_name: resolvedTaxRate.name || "21%" })];
      dialog.querySelectorAll("[data-ledger]").forEach((select) => {
        ledgerMappings[select.dataset.ledger] = select.value;
        const selected = options.ledgerAccounts.find((item) => item.id === select.value);
        saves.push(service.saveLedgerMapping({ connection_id: connection.id, category: select.dataset.ledger, external_ledger_account_id: select.value, external_ledger_account_name: selected?.name || "" }));
      });
      if (activeModel.customer.key) saves.push(service.saveCustomerMapping({ connection_id: connection.id, local_customer_key: activeModel.customer.key, local_customer_name: activeModel.customer.name, external_contact_id: selectedContact.id, external_contact_name: selectedContact.name }));
      await Promise.all(saves);
      activeModel.date = form.elements.invoiceDate.value;
      const result = await service.createDraftInvoice({
        exportModel: activeModel,
        contactId: selectedContact.id,
        taxMappings,
        ledgerMappings,
        ...(mustConfirmReexport ? { reexportKey } : {})
      });
      status(result.alreadyCreated ? "Deze conceptfactuur bestond al in je boekhoudsysteem." : `Conceptfactuur aangemaakt in ${providerName()}.`);
      button.hidden = true;
      if (result.export?.external_invoice_url) {
        const link = document.createElement("a");
        link.className = "saas-secondary-button accounting-open-link";
        link.href = result.export.external_invoice_url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = `Open in ${providerName()}`;
        button.after(link);
      }
      document.dispatchEvent(new CustomEvent("overuurtje:accounting-exported", { detail: result.export }));
    } catch (error) {
      status(error.message || "Conceptfactuur kon niet worden aangemaakt.");
      button.disabled = false;
    }
  }

  async function open({ exportModel, context }) {
    currentContext = context;
    if (!currentContext?.isPro) {
      document.dispatchEvent(new CustomEvent("overuurtje:pro-required", { detail: { feature: "accounting_export" } }));
      return;
    }
    originalModel = structuredClone(exportModel);
    originalModel.lineItems = originalModel.lineItems.map((line) => ({ ...line, vatPercentage: 21 }));
    reexportKey = crypto.randomUUID();
    selectedContact = null;
    resolvedTaxRate = null;
    ensureDialog();
    document.documentElement.classList.add("dialog-open");
    const submit = dialog.querySelector("button[type='submit']");
    submit.hidden = false;
    submit.disabled = false;
    dialog.querySelector(".accounting-open-link")?.remove();
    dialog.querySelector("form").reset();
    status("Boekhoudkoppeling laden…");
    dialog.showModal();
    try {
      const result = await service.status();
      connection = result.connection;
      if (!connection || connection.status !== "connected" || !(connection.administration_id || connection.administrationId)) {
        throw new Error("Kies en verbind eerst een boekhoudsysteem via Account → Boekhouding.");
      }
      const [configuration, history] = await Promise.all([service.configurationOptions(), service.exports()]);
      options = configuration;
      exportHistory = history;
      dialog.querySelector("input[name='invoiceDate']").value = originalModel.date;
      dialog.querySelector("input[name='contactSearch']").value = "";
      dialog.querySelector("[data-accounting-contact-suggestions]").replaceChildren();
      dialog.querySelector("[data-accounting-contact-suggestions]").hidden = true;
      renderSources();
      await refreshPreview();
      const mappings = await service.customerMappings();
      const mapped = mappings.find((item) => item.local_customer_key === originalModel.customer.key);
      selectMappedContact(mapped);
      status("");
    } catch (error) {
      status(error.message);
      submit.disabled = true;
    }
  }

  globalThis.OveruurtjeAccountingUi = Object.freeze({ open });
})();
