(function initializeShareUi() {
  "use strict";

  const shares = globalThis.OveruurtjeShares;
  const sessionUi = globalThis.OveruurtjeSessionUI;
  let activeSource = null;

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "O";
  }

  function invitationUrl(token) {
    const url = new URL(activeSource?.type === "project" ? "projects.html" : "workdays.html", location.href);
    url.search = "";
    url.searchParams.set("invite", token);
    return url.href;
  }

  async function shareLink(url) {
    const isProject = activeSource?.type === "project";
    const payload = {
      title: isProject ? "Project delen via Overuurtje.nl" : "Werkdag delen via Overuurtje.nl",
      text: isProject
        ? "Ik wil graag dit project en de werktijden met je delen via Overuurtje.nl."
        : "Ik wil graag mijn werktijden met je delen via Overuurtje.nl.",
      url
    };
    if (navigator.share) {
      await navigator.share(payload);
      return "Uitnodiging gedeeld.";
    }
    await navigator.clipboard.writeText(`${payload.text}\n${url}`);
    return "Uitnodigingslink gekopieerd.";
  }

  function ensureDialog() {
    let dialog = document.querySelector("#share-workday-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog share-workday-dialog";
    dialog.id = "share-workday-dialog";
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-share-close aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Overuurtje Pro</p>
      <h2>Deel met collega's</h2>
      <p class="share-privacy-note">Deel een persoonlijke uitnodigingslink via WhatsApp, Berichten, Mail of een andere app. Alleen datum en tijden worden zichtbaar; financiële gegevens blijven privé.</p>
      <label>
        <span>Bericht <small>(optioneel)</small></span>
        <textarea data-share-message maxlength="500" rows="3" placeholder="Controleer de eindtijd nog even."></textarea>
      </label>
      <fieldset class="share-mode-options">
        <legend>Deelmoment</legend>
        <label class="share-mode-toggle">
          <input type="radio" name="shareMode" value="direct" checked>
          <span class="share-mode-switch" aria-hidden="true"></span>
          <span><strong>Direct delen</strong><small>De werkdag is meteen zichtbaar en loopt live mee tot je de eindtijd opslaat.</small></span>
        </label>
        <label class="share-mode-toggle">
          <input type="radio" name="shareMode" value="on_completion">
          <span class="share-mode-switch" aria-hidden="true"></span>
          <span><strong>Delen zodra de werkdag is afgerond</strong><small>De melding volgt zodra een eindtijd is ingevuld en de werkdag is opgeslagen.</small></span>
        </label>
      </fieldset>
      <p class="share-account-note">De ontvanger kan een gratis of Pro-account gebruiken. Zonder account wordt eerst gevraagd om er een aan te maken.</p>
      <p class="saas-form-status" data-share-status aria-live="polite"></p>
      <button class="saas-primary-button share-invite-button" type="button" data-share-submit>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.7 6.8-4.1M8.6 13.3l6.8 4.1"></path></svg>
        <span data-share-submit-label>Uitnodigingslink delen</span>
      </button>
      <section class="shared-with-section" data-shared-with hidden>
        <h3>Deelnemers</h3>
        <div data-shared-with-list></div>
      </section>
    `;
    document.body.append(dialog);
    dialog.querySelector("[data-share-submit]").addEventListener("click", () => submit(dialog));
    dialog.querySelector("[data-share-close]").addEventListener("click", () => closeDialog(dialog));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    return dialog;
  }

  async function renderSent(dialog) {
    const section = dialog.querySelector("[data-shared-with]");
    const list = dialog.querySelector("[data-shared-with-list]");
    try {
      const [sent, participants] = await Promise.all([
        shares.listSent(activeSource.type, activeSource.id),
        shares.listParticipants(activeSource.type, activeSource.id)
      ]);
      const sentByUserId = new Map(sent.map((item) => [item.recipientId, item]));
      section.hidden = participants.length === 0;
      list.replaceChildren(...participants.map((participant) => {
        const item = sentByUserId.get(participant.userId);
        const row = document.createElement("div");
        row.className = "shared-with-row";
        row.innerHTML = `
          <span class="share-avatar"></span>
          <span><strong></strong><small></small></span>
          <button type="button" aria-label="Niet meer delen">&times;</button>
        `;
        row.querySelector(".share-avatar").textContent = initials(participant.firstName);
        row.querySelector("strong").textContent = participant.isCurrentUser
          ? `${participant.firstName} (jij)`
          : participant.firstName;
        row.querySelector("small").textContent = participant.isOwner
          ? "Eigenaar"
          : (item?.deliveredAt ? "Deelnemer" : "Wacht op eindtijd");
        const removeButton = row.querySelector("button");
        removeButton.hidden = participant.isOwner || !item;
        if (item) {
          removeButton.addEventListener("click", async () => {
            if (activeSource.type === "project") await shares.removeProjectShare(item.id);
            else await shares.remove(item.id);
            await renderSent(dialog);
            sessionUi.showToast("Collega verwijderd.");
            document.dispatchEvent(new CustomEvent("overuurtje:shares-changed"));
          });
        }
        return row;
      }));
    } catch {
      section.hidden = true;
    }
  }

  async function submit(dialog) {
    const status = dialog.querySelector("[data-share-status]");
    const button = dialog.querySelector("[data-share-submit]");
    button.disabled = true;
    status.textContent = "Uitnodiging maken…";
    try {
      const token = await shares.createInvite({
        sourceType: activeSource.type,
        sourceId: activeSource.id,
        message: dialog.querySelector("[data-share-message]").value,
        shareMode: activeSource.type === "project"
          ? "direct"
          : dialog.querySelector('[name="shareMode"]:checked').value
      });
      const message = await shareLink(invitationUrl(token));
      status.textContent = message;
      sessionUi.showToast(message);
      globalThis.OveruurtjeAnalytics?.track?.("share_clicked", {
        share_type: activeSource.type === "project" ? "project_invite" : "workday_invite"
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        status.textContent = error.message || "Delen is niet gelukt.";
      } else {
        status.textContent = "";
      }
    } finally {
      button.disabled = false;
    }
  }

  async function open({ sourceType, sourceId }) {
    const context = sessionUi.getContext();
    if (!context?.isPro) {
      sessionUi.openUpgrade();
      return;
    }
    activeSource = { type: sourceType, id: sourceId };
    const dialog = ensureDialog();
    const isProject = sourceType === "project";
    dialog.querySelector("h2").textContent = isProject ? "Deel project met collega's" : "Deel met collega's";
    dialog.querySelector(".share-privacy-note").textContent = isProject
      ? "Deel een persoonlijke uitnodigingslink. Je collega ziet de projectnaam, periode en datum en tijden per projectdag. Financiële gegevens blijven privé."
      : "Deel een persoonlijke uitnodigingslink via WhatsApp, Berichten, Mail of een andere app. Alleen datum en tijden worden zichtbaar; financiële gegevens blijven privé.";
    dialog.querySelector(".share-mode-options").hidden = isProject;
    dialog.querySelector(".share-account-note").textContent = isProject
      ? "De ontvanger kan het gedeelde project met een gratis of Pro-account bekijken."
      : "De ontvanger kan een gratis of Pro-account gebruiken. Zonder account wordt eerst gevraagd om er een aan te maken.";
    dialog.querySelector("[data-share-submit-label]").textContent = isProject
      ? "Projectlink delen"
      : "Uitnodigingslink delen";
    dialog.querySelector("[data-share-status]").textContent = "";
    openDialog(dialog);
    await renderSent(dialog);
  }

  globalThis.OveruurtjeShareUI = Object.freeze({ open });
})();
