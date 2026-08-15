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

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog accounting-dialog";
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-accounting-close aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Boekhouding</p>
      <h2>Controleer voor Moneybird</h2>
      <p class="accounting-dialog-intro">Controleer de regels. Overuurtje maakt alleen een conceptfactuur; verzenden doe je zelf in Moneybird.</p>
      <form class="accounting-preview-form">
        <div class="accounting-preview-meta">
          <label><span>Administratie</span><select name="administration" required></select></label>
          <label class="accounting-contact-field"><span>Opdrachtgever</span><input name="contactSearch" type="search" placeholder="Zoek Moneybird-contact" autocomplete="off"><select name="contact" size="4" required></select></label>
          <label><span>Factuurdatum</span><input name="invoiceDate" type="date" required></label>
        </div>
        <fieldset class="accounting-source-selection" hidden><legend>Projectdagen</legend><div data-accounting-sources></div></fieldset>
        <div class="accounting-lines"></div>
        <div class="accounting-mappings"></div>
        <div class="accounting-preview-total"><span>Totaal excl. btw</span><strong></strong></div>
        <label class="accounting-reexport" hidden><input type="checkbox" name="confirmReexport"><span>Bewust opnieuw exporteren naar een nieuw Moneybird-concept</span></label>
        <p class="saas-form-status" aria-live="polite"></p>
        <button class="saas-primary-button" type="submit">Maak conceptfactuur</button>
      </form>`;
    document.body.append(dialog);
    dialog.querySelector("[data-accounting-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.querySelector("input[name='contactSearch']").addEventListener("input", debounce(loadContacts, 350));
    dialog.querySelector("select[name='administration']").addEventListener("change", changeAdministration);
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
      label.innerHTML = `<input type="checkbox" data-accounting-source value="${item.sourceId}" ${wasExported ? "" : "checked"}><span>${line?.description?.replace(/^.*?–\s*/, "") || "Projectdag"}</span>${wasExported ? "<small>Moneybird ✓</small>" : ""}`;
      return label;
    }));
  }

  async function loadContacts() {
    const query = dialog.querySelector("input[name='contactSearch']").value;
    const result = await service.contacts(query);
    const select = dialog.querySelector("select[name='contact']");
    const previous = select.value;
    select.replaceChildren(...result.contacts.map((contact) => {
      const option = document.createElement("option");
      option.value = contact.id;
      option.textContent = `${contact.name}${contact.email ? ` · ${contact.email}` : ""}`;
      option.dataset.name = contact.name;
      return option;
    }));
    if (Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }

  function selectMappedContact(mapped) {
    if (!mapped) return;
    const select = dialog.querySelector("select[name='contact']");
    if (!Array.from(select.options).some((option) => option.value === mapped.external_contact_id)) {
      const option = new Option(mapped.external_contact_name || originalModel.customer.name, mapped.external_contact_id);
      option.dataset.name = mapped.external_contact_name || originalModel.customer.name;
      select.add(option, 0);
    }
    select.value = mapped.external_contact_id;
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
    const percentages = [...new Set(model.lineItems.map((item) => Number(item.vatPercentage)))];
    const root = dialog.querySelector(".accounting-mappings");
    root.innerHTML = `<h3>Moneybird-koppelingen</h3>`;
    percentages.forEach((percentage) => {
      const label = document.createElement("label");
      label.innerHTML = `<span>Btw ${percentage}%</span><select data-tax="${percentage}" required><option value="">Kies Moneybird-btw</option></select>`;
      const select = label.querySelector("select");
      options.taxRates.forEach((tax) => select.add(new Option(`${tax.name} (${tax.percentage}%)`, tax.id)));
      select.value = savedTaxes.find((item) => Number(item.local_tax_percentage) === percentage)?.external_tax_rate_id || "";
      root.append(label);
    });
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

  async function changeAdministration(event) {
    status("Administratie wisselen…");
    try {
      const result = await service.selectAdministration(event.target.value);
      connection = result.connection;
      options = await service.configurationOptions();
      dialog.querySelector("input[name='contactSearch']").value = "";
      await Promise.all([loadContacts(), renderMappings()]);
      status("");
    } catch (error) { status(error.message); }
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
      const contact = form.elements.contact.selectedOptions[0];
      if (!contact) throw new Error("Kies eerst een Moneybird-contact.");
      const taxMappings = {};
      const ledgerMappings = {};
      const saves = [];
      dialog.querySelectorAll("[data-tax]").forEach((select) => {
        taxMappings[select.dataset.tax] = select.value;
        const selected = options.taxRates.find((item) => item.id === select.value);
        saves.push(service.saveTaxMapping({ connection_id: connection.id, local_tax_percentage: Number(select.dataset.tax), external_tax_rate_id: select.value, external_tax_rate_name: selected?.name || "" }));
      });
      dialog.querySelectorAll("[data-ledger]").forEach((select) => {
        ledgerMappings[select.dataset.ledger] = select.value;
        const selected = options.ledgerAccounts.find((item) => item.id === select.value);
        saves.push(service.saveLedgerMapping({ connection_id: connection.id, category: select.dataset.ledger, external_ledger_account_id: select.value, external_ledger_account_name: selected?.name || "" }));
      });
      if (activeModel.customer.key) saves.push(service.saveCustomerMapping({ connection_id: connection.id, local_customer_key: activeModel.customer.key, local_customer_name: activeModel.customer.name, external_contact_id: contact.value, external_contact_name: contact.dataset.name || contact.textContent }));
      await Promise.all(saves);
      activeModel.date = form.elements.invoiceDate.value;
      const result = await service.createDraftInvoice({
        exportModel: activeModel,
        contactId: contact.value,
        taxMappings,
        ledgerMappings,
        ...(mustConfirmReexport ? { reexportKey } : {})
      });
      status(result.alreadyCreated ? "Deze conceptfactuur bestond al in Moneybird." : "Conceptfactuur aangemaakt in Moneybird.");
      button.hidden = true;
      if (result.export?.external_invoice_url) {
        const link = document.createElement("a");
        link.className = "saas-secondary-button accounting-open-link";
        link.href = result.export.external_invoice_url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Open in Moneybird";
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
    reexportKey = crypto.randomUUID();
    ensureDialog();
    document.documentElement.classList.add("dialog-open");
    const submit = dialog.querySelector("button[type='submit']");
    submit.hidden = false;
    submit.disabled = false;
    dialog.querySelector(".accounting-open-link")?.remove();
    dialog.querySelector("form").reset();
    status("Moneybird laden…");
    dialog.showModal();
    try {
      const result = await service.status();
      connection = result.connection;
      if (!connection || connection.status !== "connected") throw new Error("Verbind Moneybird eerst via Account → Boekhouding.");
      const [administrations, configuration, history] = await Promise.all([
        service.administrations(), service.configurationOptions(), service.exports()
      ]);
      options = configuration;
      exportHistory = history;
      const admin = dialog.querySelector("select[name='administration']");
      admin.replaceChildren(...administrations.administrations.map((item) => new Option(item.name, item.id)));
      admin.value = connection.administration_id || connection.administrationId || "";
      dialog.querySelector("input[name='invoiceDate']").value = originalModel.date;
      renderSources();
      await Promise.all([loadContacts(), refreshPreview()]);
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
