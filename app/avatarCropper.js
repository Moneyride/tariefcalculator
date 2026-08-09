(() => {
  "use strict";

  const OUTPUT_SIZE = 512;
  const PREVIEW_SIZE = 320;
  const MAX_SOURCE_SIZE = 20 * 1024 * 1024;

  function create(options = {}) {
    const dialog = options.dialog;
    const canvas = options.canvas;
    const zoomInput = options.zoomInput;
    const confirmButton = options.confirmButton;
    const closeButtons = Array.from(options.closeButtons || []);
    if (!dialog || !canvas || !zoomInput || !confirmButton) return null;

    const context = canvas.getContext("2d", { alpha: false });
    let image = null;
    let objectUrl = "";
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let pointer = null;
    let resolveCrop = null;
    let confirmed = false;

    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;

    function imageScale() {
      if (!image) return 1;
      return Math.max(PREVIEW_SIZE / image.naturalWidth, PREVIEW_SIZE / image.naturalHeight) * zoom;
    }

    function clampOffsets() {
      if (!image) return;
      const scale = imageScale();
      const maxX = Math.max(0, (image.naturalWidth * scale - PREVIEW_SIZE) / 2);
      const maxY = Math.max(0, (image.naturalHeight * scale - PREVIEW_SIZE) / 2);
      offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
      offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    }

    function draw() {
      context.fillStyle = "#eef1ee";
      context.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      if (!image) return;
      clampOffsets();
      const scale = imageScale();
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (PREVIEW_SIZE - width) / 2 + offsetX,
        (PREVIEW_SIZE - height) / 2 + offsetY,
        width,
        height
      );
    }

    function finish(result) {
      if (resolveCrop) resolveCrop(result);
      resolveCrop = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = "";
      image = null;
      pointer = null;
    }

    function cancel() {
      confirmed = false;
      if (dialog.open) dialog.close();
    }

    async function exportCrop() {
      if (!image) return null;
      const output = document.createElement("canvas");
      output.width = OUTPUT_SIZE;
      output.height = OUTPUT_SIZE;
      const outputContext = output.getContext("2d", { alpha: false });
      outputContext.fillStyle = "#ffffff";
      outputContext.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const multiplier = OUTPUT_SIZE / PREVIEW_SIZE;
      const scale = imageScale();
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      outputContext.drawImage(
        image,
        ((PREVIEW_SIZE - width) / 2 + offsetX) * multiplier,
        ((PREVIEW_SIZE - height) / 2 + offsetY) * multiplier,
        width * multiplier,
        height * multiplier
      );
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/jpeg", 0.9));
      return blob ? new File([blob], "profielfoto.jpg", { type: "image/jpeg" }) : null;
    }

    zoomInput.addEventListener("input", () => {
      zoom = Number(zoomInput.value) || 1;
      draw();
    });

    canvas.addEventListener("pointerdown", (event) => {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = PREVIEW_SIZE / rect.width;
      offsetX += (event.clientX - pointer.x) * ratio;
      offsetY += (event.clientY - pointer.y) * ratio;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      draw();
    });
    ["pointerup", "pointercancel"].forEach((type) => canvas.addEventListener(type, (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    }));

    closeButtons.forEach((button) => button.addEventListener("click", cancel));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      cancel();
    });
    dialog.addEventListener("close", () => {
      if (!confirmed) finish(null);
      confirmed = false;
    });
    confirmButton.addEventListener("click", async () => {
      confirmButton.disabled = true;
      try {
        const file = await exportCrop();
        if (!file) return;
        confirmed = true;
        dialog.close();
        finish(file);
      } finally {
        confirmButton.disabled = false;
      }
    });

    async function crop(file) {
      if (!(file instanceof File)) throw new Error("Kies een afbeelding.");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Gebruik een JPG, PNG of WebP-afbeelding.");
      if (file.size > MAX_SOURCE_SIZE) throw new Error("Gebruik een afbeelding kleiner dan 20 MB.");

      if (resolveCrop) finish(null);
      objectUrl = URL.createObjectURL(file);
      image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      zoomInput.value = "1";
      draw();
      dialog.showModal();
      return new Promise((resolve) => { resolveCrop = resolve; });
    }

    return Object.freeze({ crop });
  }

  globalThis.OveruurtjeAvatarCropper = Object.freeze({ create });
})();
