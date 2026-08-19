(function initializeAccountingUi() {
  "use strict";

  const service = globalThis.OveruurtjeAccounting;
  const exportTools = globalThis.OveruurtjeAccountingExport;
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const categoryLabels = Object.freeze({
    normal_day: "Dagtarieven",
    half_day: "Halve dagen",
    hourly_rate: "Uurtarieven",
    minimum_hours: "Minimale afname",
    overtime_100: "Overuren 100%",
    overtime_150: "Overuren 150%",
    overtime_200: "Overuren 200%",
    overtime_250: "Overuren 250%",
    night_hours: "Nachturen",
    travel_day_eu: "Reisdagen binnen Europa",
    travel_day_non_eu: "Reisdagen buiten Europa",
    mileage: "Kilometers",
    parking: "Parkeer- en onkosten",
    drone: "Drone",
    ronin: "Ronin 4D",
    gear: "Apparatuur",
    custom_extra: "Overige kosten"
  });
  const legacyMappingCategories = Object.freeze({
    half_day: "normal_day",
    hourly_rate: "normal_day",
    minimum_hours: "normal_day",
    overtime_100: "overtime",
    overtime_150: "overtime",
    overtime_200: "overtime",
    overtime_250: "overtime",
    parking: "custom_extra",
    drone: "gear",
    ronin: "gear"
  });
  let dialog;
  let originalModel;
  let connection;
  let options;
  let currentContext;
  let exportHistory = { exports: [], items: [] };
  let reexportKey = crypto.randomUUID();
  let selectedContact = null;
  let resolvedTaxRate = null;
  let previewReady = false;
  let creatingDraft = false;
  let requiresReexport = false;
  let contactRequestSequence = 0;

  function providerName() {
    return connection?.provider === "moneybird" ? "Moneybird" : "je boekhoudsysteem";
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog accounting-dialog";
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-accounting-close aria-label="Sluiten">&times;</button>
      <header class="accounting-dialog-header">
        <p class="dialog-eyebrow">Boekhouding</p>
        <h2>Controleer conceptfactuur</h2>
        <p class="accounting-dialog-intro">Controleer de regels. Overuurtje maakt alleen een conceptfactuur; verzenden doe je zelf in je boekhoudsysteem.</p>
      </header>
      <form class="accounting-preview-form">
        <div class="accounting-dialog-scroll">
          <div class="accounting-preview-meta">
            <label class="accounting-contact-field"><span>Opdrachtgever</span><input name="contactSearch" type="search" placeholder="Zoek opdrachtgever" autocomplete="off"><div class="accounting-contact-suggestions" data-accounting-contact-suggestions hidden></div></label>
            <label><span>Factuurdatum</span><input name="invoiceDate" type="date" required></label>
          </div>
          <fieldset class="accounting-source-selection" hidden><legend>Projectdagen</legend><div data-accounting-sources></div></fieldset>
          <div class="accounting-lines"></div>
          <div class="accounting-mappings"></div>
          <div class="accounting-preview-totals" aria-label="Factuurtotalen"></div>
          <label class="accounting-reexport checkbox-label" hidden><input type="checkbox" name="confirmReexport"><span>Bewust opnieuw exporteren naar een nieuw concept</span></label>
        </div>
        <footer class="accounting-dialog-actions">
          <p class="saas-form-status" aria-live="polite"></p>
          <button class="saas-primary-button" type="submit">Maak conceptfactuur</button>
        </footer>
      </form>`;
    document.body.append(dialog);
    dialog.querySelector("[data-accounting-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.querySelector("input[name='contactSearch']").addEventListener("input", debounce(loadContacts, 300));
    dialog.querySelector("[data-accounting-contact-suggestions]").addEventListener("click", chooseContactSuggestion);
    dialog.querySelector("[data-accounting-sources]").addEventListener("change", refreshPreview);
    dialog.querySelector("input[name='confirmReexport']").addEventListener("change", syncSubmitState);
    dialog.querySelector("form").addEventListener("submit", createDraft);
    return dialog;
  }

  function close() {
    contactRequestSequence += 1;
    dialog?.close();
    document.documentElement.classList.remove("dialog-open");
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function status(message) { ensureDialog().querySelector(".saas-form-status").textContent = message || ""; }

  function syncSubmitState() {
    const submit = ensureDialog().querySelector("button[type='submit']");
    const confirmed = dialog.querySelector("input[name='confirmReexport']").checked;
    submit.disabled = !previewReady || creatingDraft || (requiresReexport && !confirmed);
  }
  function createdExportIds() {
    const created = new Set((exportHistory.exports || []).filter((item) => item.status === "created").map((item) => item.id));
    return new Set((exportHistory.items || []).filter((item) => created.has(item.export_id)).map((item) => item.source_id));
  }

  function selectedModel() {
    if (originalModel.sourceType !== "project") return originalModel;
    const ids = Array.from(dialog.querySelectorAll("[data-accounting-source]:checked"), (input) => input.value);
    return exportTools.withSourceItems(originalModel, ids);
  }

  function projectDayLabel(item) {
    if (!item?.date) return "Projectdag";
    const date = new Date(`${item.date}T12:00:00`);
    if (Number.isNaN(date.getTime())) return item.date;
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date).replace(/^./, (character) => character.toUpperCase());
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
      label.className = `checkbox-label accounting-source-row${wasExported ? " is-exported" : ""}`;
      label.innerHTML = `<input type="checkbox" data-accounting-source value="${item.sourceId}" ${wasExported ? "" : "checked"}><span class="accounting-source-date"></span>${wasExported ? "<small>Geëxporteerd ✓</small>" : ""}`;
      label.querySelector(".accounting-source-date").textContent = projectDayLabel(item);
      return label;
    }));
  }

  async function loadContacts() {
    const input = dialog.querySelector("input[name='contactSearch']");
    const query = input.value.trim();
    const suggestions = dialog.querySelector("[data-accounting-contact-suggestions]");
    selectedContact = selectedContact?.name === query ? selectedContact : null;
    if (query.length < 2) {
      contactRequestSequence += 1;
      suggestions.replaceChildren();
      suggestions.hidden = true;
      return;
    }
    const request = ++contactRequestSequence;
    let result;
    try {
      result = await service.contacts(query);
    } catch (error) {
      if (request === contactRequestSequence) status(error.message || "Opdrachtgevers konden niet worden gezocht.");
      return;
    }
    if (request !== contactRequestSequence || input.value.trim() !== query) return;
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
    summarizePreviewLines(model.lineItems).forEach((item) => {
      const row = document.createElement("div");
      row.className = "accounting-line";
      row.innerHTML = `<span data-label="Omschrijving"></span><span data-label="Aantal"></span><span data-label="Prijs"></span><span data-label="Btw"></span><strong data-label="Regelbedrag"></strong>`;
      row.children[0].textContent = item.description;
      row.children[1].textContent = item.quantityLabel;
      row.children[2].textContent = item.priceLabel;
      row.children[3].textContent = `${item.vatPercentage}%`;
      row.children[4].textContent = euro.format(item.lineTotal);
      root.append(row);
    });
    renderTotals(model.lineItems);
  }

  function summarizePreviewLines(lineItems) {
    const groups = new Map();
    lineItems.forEach((item) => {
      const key = `${item.category}:${Number(item.vatPercentage || 0)}`;
      const group = groups.get(key) || {
        category: item.category,
        description: categoryLabels[item.category] || "Overige kosten",
        vatPercentage: Number(item.vatPercentage || 0),
        quantity: 0,
        units: new Set(),
        prices: new Set(),
        lineTotal: 0,
        count: 0
      };
      group.quantity += Number(item.quantity || 0);
      group.units.add(item.unit || "stuk");
      group.prices.add(Number(item.unitPrice || 0).toFixed(2));
      group.lineTotal += Number(item.lineTotal || 0);
      group.count += 1;
      groups.set(key, group);
    });
    return [...groups.values()].map((group) => {
      const singleUnit = group.units.size === 1 ? [...group.units][0] : "regels";
      const dayLabel = ["normal_day", "half_day"].includes(group.category) || group.category.startsWith("travel_day_");
      const quantityLabel = dayLabel
        ? `${group.count.toLocaleString("nl-NL")} ${group.count === 1 ? "dag" : "dagen"}`
        : `${group.quantity.toLocaleString("nl-NL")} ${singleUnit}`;
      return {
        ...group,
        quantityLabel,
        priceLabel: group.prices.size === 1 ? euro.format(Number([...group.prices][0])) : "Verschillend",
        lineTotal: Math.round((group.lineTotal + Number.EPSILON) * 100) / 100
      };
    });
  }

  function renderTotals(lineItems) {
    const totals = exportTools.summarizeTotals(lineItems);
    const root = dialog.querySelector(".accounting-preview-totals");
    root.replaceChildren();
    const rows = [
      ["Totaal excl. btw", totals.subtotal],
      ...totals.vatLines.map((item) => [`Btw ${Number(item.percentage).toLocaleString("nl-NL")}%`, item.amount]),
      ["Totaal incl. btw", totals.total]
    ];
    rows.forEach(([label, amount], index) => {
      const row = document.createElement("div");
      row.className = index === rows.length - 1 ? "accounting-total-row is-grand-total" : "accounting-total-row";
      row.innerHTML = "<span></span><strong></strong>";
      row.children[0].textContent = label;
      row.children[1].textContent = euro.format(amount);
      root.append(row);
    });
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
      const name = categoryLabels[category] || "Overige kosten";
      const label = document.createElement("label");
      label.innerHTML = `<span>Grootboek · ${name}</span><select data-ledger="${category}" required><option value="">Kies grootboekrekening</option></select>`;
      const select = label.querySelector("select");
      options.ledgerAccounts.forEach((ledger) => select.add(new Option(ledger.name, ledger.id)));
      const saved = savedLedgers.find((item) => item.category === category)
        || savedLedgers.find((item) => item.category === legacyMappingCategories[category]);
      select.value = saved?.external_ledger_account_id || "";
      root.append(label);
    });
  }

  function renderReexportState() {
    const selected = selectedModel().sourceItems.map((item) => item.sourceId);
    const hasExported = selected.some((id) => createdExportIds().has(id));
    const label = dialog.querySelector(".accounting-reexport");
    requiresReexport = hasExported;
    label.hidden = !requiresReexport;
    if (!hasExported) label.querySelector("input").checked = false;
    syncSubmitState();
  }

  async function refreshPreview() {
    const restoreReadyState = previewReady;
    previewReady = false;
    syncSubmitState();
    renderLines();
    renderReexportState();
    try {
      await renderMappings();
      previewReady = restoreReadyState;
    } catch (error) {
      previewReady = false;
      status(error.message || "Boekhoudkoppelingen konden niet worden geladen.");
    } finally {
      syncSubmitState();
    }
  }

  async function createDraft(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const activeModel = selectedModel();
    if (!activeModel.sourceItems.length || !activeModel.lineItems.length) { status("Selecteer minimaal één projectdag."); return; }
    const mustConfirmReexport = requiresReexport;
    if (mustConfirmReexport && !form.elements.confirmReexport.checked) { status("Bevestig dat je de reeds geëxporteerde dag opnieuw wilt meenemen."); return; }
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type='submit']");
    creatingDraft = true;
    syncSubmitState();
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
      creatingDraft = false;
      syncSubmitState();
    }
  }

  async function open({ exportModel, context }) {
    contactRequestSequence += 1;
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
    previewReady = false;
    creatingDraft = false;
    requiresReexport = false;
    ensureDialog();
    document.documentElement.classList.add("dialog-open");
    const submit = dialog.querySelector("button[type='submit']");
    submit.hidden = false;
    syncSubmitState();
    dialog.querySelector(".accounting-open-link")?.remove();
    dialog.querySelector("form").reset();
    status("Boekhoudkoppeling laden…");
    dialog.showModal();
    try {
      const bootstrap = await service.previewBootstrap();
      connection = bootstrap.connection;
      if (!connection || connection.status !== "connected" || !(connection.administration_id || connection.administrationId)) {
        throw new Error("Kies en verbind eerst een boekhoudsysteem via Account → Boekhouding.");
      }
      options = bootstrap.configuration;
      exportHistory = bootstrap.history;
      dialog.querySelector("input[name='invoiceDate']").value = originalModel.date;
      dialog.querySelector("input[name='contactSearch']").value = "";
      dialog.querySelector("[data-accounting-contact-suggestions]").replaceChildren();
      dialog.querySelector("[data-accounting-contact-suggestions]").hidden = true;
      renderSources();
      await refreshPreview();
      const mappings = bootstrap.customerMappings;
      const mapped = mappings.find((item) => item.local_customer_key === originalModel.customer.key);
      selectMappedContact(mapped);
      previewReady = true;
      syncSubmitState();
      status("");
    } catch (error) {
      status(error.message);
      previewReady = false;
      syncSubmitState();
    }
  }

  globalThis.OveruurtjeAccountingUi = Object.freeze({ open });
})();
