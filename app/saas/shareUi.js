(function initializeShareUi() {
  "use strict";

  const shares = globalThis.OveruurtjeShares;
  const sessionUi = globalThis.OveruurtjeSessionUI;
  let activeSource = null;
  let activeInvitationUrl = "";

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
    const url = new URL("delen.html", location.href);
    url.search = "";
    url.searchParams.set("invite", token);
    url.searchParams.set("type", activeSource?.type === "project" ? "project" : "workday");
    return url.href;
  }

  async function shareLink(url) {
    if (navigator.share) {
      await navigator.share({ url });
      return "Uitnodiging gedeeld.";
    }
    await navigator.clipboard.writeText(url);
    return "Uitnodigingslink gekopieerd.";
  }

  function ensureDialog() {
    let dialog = document.querySelector("#share-workday-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog share-workday-dialog";
    dialog.id = "share-workday-dialog";
    dialog.innerHTML = `
      <div data-share-main-view>
        <button class="dialog-close" type="button" data-share-close aria-label="Sluiten">&times;</button>
        <p class="dialog-eyebrow">Samen registreren</p>
        <h2>Deel met collega's</h2>
        <p class="share-privacy-note">Deel een persoonlijke link. Je collega ziet alleen de datum en tijden; je tarieven en administratie blijven privé.</p>
        <div class="share-direct-note">
          <span class="share-live-dot" aria-hidden="true"></span>
          <span><strong>Direct delen</strong><small>De werkdag is meteen zichtbaar en loopt live mee tot de eindtijd is opgeslagen.</small></span>
        </div>
        <p class="share-account-note">De ontvanger heeft een Overuurtje-account nodig.</p>
        <p class="saas-form-status" data-share-status aria-live="polite"></p>
        <div class="share-action-grid">
          <button class="saas-primary-button share-invite-button" type="button" data-share-submit>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.7 6.8-4.1M8.6 13.3l6.8 4.1"></path></svg>
            <span data-share-submit-label>Uitnodigingslink delen</span>
          </button>
          <button class="saas-secondary-button share-qr-button" type="button" data-share-qr title="QR-code tonen" aria-label="QR-code tonen">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3"></path></svg>
            <span>QR-code</span>
          </button>
        </div>
        <section class="shared-with-section" data-shared-with hidden>
          <h3>Deelnemers</h3>
          <div data-shared-with-list></div>
        </section>
      </div>
      <section class="share-qr-view" data-share-qr-view hidden>
        <button class="share-back-button" type="button" data-share-back aria-label="Terug naar delen">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg>
          <span>Terug</span>
        </button>
        <p class="dialog-eyebrow">Uitnodiging</p>
        <h2>Scan de QR-code</h2>
        <p>Laat je collega deze code scannen om de gedeelde werkdag te openen.</p>
        <div class="share-qr-code" data-share-qr-code aria-label="QR-code voor de uitnodigingslink"></div>
      </section>
    `;
    document.body.append(dialog);
    dialog.querySelector("[data-share-submit]").addEventListener("click", () => submit(dialog));
    dialog.querySelector("[data-share-qr]").addEventListener("click", () => showQrCode(dialog));
    dialog.querySelector("[data-share-back]").addEventListener("click", () => showMainView(dialog));
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
        if (participant.avatarUrl) {
          row.querySelector(".share-avatar").style.backgroundImage = `url("${participant.avatarUrl.replace(/["\\]/g, "")}")`;
          row.querySelector(".share-avatar").classList.add("has-image");
          row.querySelector(".share-avatar").textContent = "";
        }
        const name = participant.isCurrentUser
          ? `${participant.firstName} (jij)`
          : participant.firstName;
        row.querySelector("strong").textContent = participant.selectedBadgeIcon
          ? `${name} ${participant.selectedBadgeIcon}`
          : name;
        row.querySelector("strong").title = participant.selectedBadgeName || "";
        row.querySelector("small").textContent = participant.isOwner
          ? "Eigenaar"
          : (participant.jointWorkdays > 0
            ? `${participant.jointWorkdays} gezamenlijke werkdagen`
            : (item?.deliveredAt ? "Deelnemer" : "Wacht op eindtijd"));
        const removeButton = row.querySelector("button");
        removeButton.hidden = participant.isOwner || !item;
        const profileTarget = row.querySelector("span:nth-child(2)");
        if (!participant.isCurrentUser) {
          profileTarget.classList.add("is-crew-card-link");
          profileTarget.tabIndex = 0;
          profileTarget.setAttribute("role", "button");
          profileTarget.setAttribute("aria-label", `Bekijk de Crew Card van ${participant.firstName}`);
          const openCrewCard = () => globalThis.OveruurtjeCrewCards?.open?.(participant.userId);
          profileTarget.addEventListener("click", openCrewCard);
          profileTarget.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openCrewCard();
            }
          });
        }
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

  async function ensureInvitation() {
    if (activeInvitationUrl) return activeInvitationUrl;
    const token = await shares.createInvite({
      sourceType: activeSource.type,
      sourceId: activeSource.id,
      message: "",
      shareMode: "direct"
    });
    activeInvitationUrl = invitationUrl(token);
    return activeInvitationUrl;
  }

  function showMainView(dialog) {
    dialog.querySelector("[data-share-main-view]").hidden = false;
    dialog.querySelector("[data-share-qr-view]").hidden = true;
  }

  async function showQrCode(dialog) {
    const status = dialog.querySelector("[data-share-status]");
    const button = dialog.querySelector("[data-share-qr]");
    button.disabled = true;
    status.textContent = "QR-code maken…";
    try {
      const url = await ensureInvitation();
      if (typeof globalThis.qrcode !== "function") throw new Error("QR-code kon niet worden geladen.");
      const qr = globalThis.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      dialog.querySelector("[data-share-qr-code]").innerHTML = qr.createSvgTag(7, 4, "Uitnodigingslink");
      status.textContent = "";
      dialog.querySelector("[data-share-main-view]").hidden = true;
      dialog.querySelector("[data-share-qr-view]").hidden = false;
    } catch (error) {
      status.textContent = error.message || "QR-code maken is niet gelukt.";
    } finally {
      button.disabled = false;
    }
  }

  async function submit(dialog) {
    const status = dialog.querySelector("[data-share-status]");
    const button = dialog.querySelector("[data-share-submit]");
    button.disabled = true;
    status.textContent = "Uitnodiging maken…";
    try {
      const message = await shareLink(await ensureInvitation());
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
    if (!context?.auth?.user) {
      sessionUi.openAuth("register", { purpose: "workday-sharing" });
      return;
    }
    if (sourceType !== "workday" && !context?.isPro) {
      sessionUi.openUpgrade();
      return;
    }
    activeSource = { type: sourceType, id: sourceId };
    activeInvitationUrl = "";
    const dialog = ensureDialog();
    const isProject = sourceType === "project";
    dialog.querySelector(".dialog-eyebrow").textContent = isProject
      ? "Overuurtje Pro"
      : "Samen registreren";
    dialog.querySelector("h2").textContent = isProject ? "Deel project met collega's" : "Deel met collega's";
    dialog.querySelector(".share-privacy-note").textContent = isProject
      ? "Deel een persoonlijke link. Je collega ziet de projectnaam, periode en tijden per projectdag; financiële gegevens blijven privé."
      : "Deel een persoonlijke link. Je collega ziet alleen de datum en tijden; je tarieven en administratie blijven privé.";
    dialog.querySelector(".share-account-note").textContent = isProject
      ? "De ontvanger kan het gedeelde project met een gratis of Pro-account bekijken."
      : "De ontvanger heeft een Overuurtje-account nodig. Zonder account wordt eerst gevraagd om er een aan te maken.";
    dialog.querySelector(".share-direct-note small").textContent = isProject
      ? "Het project is meteen zichtbaar en wijzigingen in de werkdagen lopen mee."
      : "De werkdag is meteen zichtbaar en loopt live mee tot de eindtijd is opgeslagen.";
    dialog.querySelector("[data-share-submit-label]").textContent = isProject
      ? "Projectlink delen"
      : "Uitnodigingslink delen";
    dialog.querySelector("[data-share-status]").textContent = "";
    showMainView(dialog);
    openDialog(dialog);
    await renderSent(dialog);
  }

  globalThis.OveruurtjeShareUI = Object.freeze({ open });
})();
