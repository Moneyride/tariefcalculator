(function initializeQrScanner() {
  "use strict";

  let dialog = null;
  let stream = null;
  let frameRequest = 0;
  let scanning = false;

  function invitationDestination(rawValue) {
    let url;
    try {
      url = new URL(String(rawValue || "").trim(), location.href);
    } catch {
      return null;
    }

    if (!/^https?:$/.test(url.protocol)) return null;
    const allowedHosts = new Set([location.hostname, "overuurtje.nl", "www.overuurtje.nl", "localhost", "127.0.0.1"]);
    const page = url.pathname.split("/").filter(Boolean).pop();
    if (!allowedHosts.has(url.hostname) || !["delen.html", "workdays.html", "projects.html"].includes(page)) return null;
    if (!url.searchParams.get("invite")) return null;

    if (["localhost", "127.0.0.1"].includes(location.hostname)) {
      const localUrl = new URL(page, document.baseURI);
      localUrl.search = url.search;
      return localUrl.href;
    }
    return url.href;
  }

  function stopCamera() {
    scanning = false;
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (dialog) {
      dialog.querySelector("video").srcObject = null;
      dialog.querySelector("[data-qr-camera]").hidden = true;
      dialog.querySelector("[data-qr-camera-start]").hidden = false;
    }
  }

  function setStatus(message, state = "") {
    if (!dialog) return;
    const status = dialog.querySelector("[data-qr-scan-status]");
    status.textContent = message;
    status.dataset.state = state;
  }

  function acceptResult(value) {
    const destination = invitationDestination(value);
    if (!destination) {
      setStatus("Dit is geen geldige Overuurtje-uitnodiging.", "error");
      return false;
    }
    stopCamera();
    setStatus("Uitnodiging gevonden. Openen…", "success");
    setTimeout(() => location.assign(destination), 180);
    return true;
  }

  function decodeCanvas(canvas, context) {
    if (typeof globalThis.jsQR !== "function") return null;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return globalThis.jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data || null;
  }

  async function scanFrame() {
    if (!scanning || !dialog) return;
    const video = dialog.querySelector("video");
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      const canvas = dialog.querySelector("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const width = Math.min(video.videoWidth, 960);
      const height = Math.round(width * (video.videoHeight / video.videoWidth));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const value = decodeCanvas(canvas, context);
      if (value && acceptResult(value)) return;
    }
    frameRequest = requestAnimationFrame(scanFrame);
  }

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("De camera is hier niet beschikbaar. Kies hieronder een foto met een QR-code.", "error");
      return;
    }
    setStatus("Camera openen…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const video = dialog.querySelector("video");
      video.srcObject = stream;
      await video.play();
      scanning = true;
      dialog.querySelector("[data-qr-camera]").hidden = false;
      dialog.querySelector("[data-qr-camera-start]").hidden = true;
      setStatus("Richt de camera op de QR-code.");
      frameRequest = requestAnimationFrame(scanFrame);
    } catch (error) {
      const denied = error?.name === "NotAllowedError";
      setStatus(
        denied
          ? "Geef Overuurtje toegang tot je camera, of kies een foto met de QR-code."
          : "De camera kon niet worden geopend. Kies eventueel een foto met de QR-code.",
        "error"
      );
    }
  }

  async function scanImage(file) {
    if (!file) return;
    setStatus("QR-code in foto zoeken…");
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = dialog.querySelector("canvas");
      const width = Math.min(bitmap.width, 1400);
      const height = Math.round(width * (bitmap.height / bitmap.width));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const value = decodeCanvas(canvas, context);
      if (!value || !acceptResult(value)) setStatus("Geen geldige Overuurtje-QR-code in deze foto gevonden.", "error");
    } catch {
      setStatus("Deze foto kon niet worden gelezen.", "error");
    }
  }

  function close() {
    stopCamera();
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog qr-scanner-dialog";
    dialog.setAttribute("aria-labelledby", "qr-scanner-title");
    dialog.innerHTML = `
      <button class="dialog-close" type="button" data-qr-scan-close aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Uitnodiging openen</p>
      <h2 id="qr-scanner-title">QR-code scannen</h2>
      <p class="qr-scanner-intro">Scan de code van je collega. Overuurtje opent daarna direct de gedeelde werkdag of het project.</p>
      <div class="qr-camera" data-qr-camera hidden>
        <video playsinline muted aria-label="Camerabeeld voor QR-code"></video>
        <span class="qr-camera-frame" aria-hidden="true"></span>
      </div>
      <canvas hidden></canvas>
      <p class="qr-scanner-status" data-qr-scan-status aria-live="polite">Camera gereedmaken…</p>
      <div class="qr-scanner-actions">
        <button class="saas-primary-button" type="button" data-qr-camera-start>Camera openen</button>
        <label class="saas-secondary-button qr-photo-button">
          QR-code uit foto
          <input type="file" accept="image/*" data-qr-photo hidden>
        </label>
      </div>
    `;
    document.body.append(dialog);
    dialog.querySelector("[data-qr-scan-close]").addEventListener("click", close);
    dialog.querySelector("[data-qr-camera-start]").addEventListener("click", startCamera);
    dialog.querySelector("[data-qr-photo]").addEventListener("change", (event) => scanImage(event.target.files?.[0]));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    return dialog;
  }

  async function open() {
    const scannerDialog = ensureDialog();
    if (typeof scannerDialog.showModal === "function") scannerDialog.showModal();
    else scannerDialog.setAttribute("open", "");
    scannerDialog.querySelector("[data-qr-camera]").hidden = true;
    scannerDialog.querySelector("[data-qr-photo]").value = "";
    await startCamera();
  }

  function installHeaderButton() {
    document.querySelectorAll(".account-navigation").forEach((navigation) => {
      if (navigation.querySelector("[data-qr-scanner-open]")) return;
      const button = document.createElement("button");
      button.className = "qr-scanner-open";
      button.type = "button";
      button.dataset.qrScannerOpen = "";
      button.title = "QR-code scannen";
      button.setAttribute("aria-label", "QR-code scannen");
      button.innerHTML = '<span class="qr-scanner-open-icon" aria-hidden="true"></span>';
      button.addEventListener("click", open);
      navigation.prepend(button);
    });
  }

  installHeaderButton();
  globalThis.OveruurtjeQrScanner = Object.freeze({ open, close, invitationDestination });
})();
