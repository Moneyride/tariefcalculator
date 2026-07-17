const { DEFAULT_SETTINGS, calculateTariff } = globalThis.TariffCalculator;

const SETTINGS_KEY = "cameraTariefCalculatorSettings";
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const QUARTER_HOURS = ["00", "15", "30", "45"];

const form = document.querySelector("#calculator-form");
const settingsForm = document.querySelector("#settings-form");
const nextDayNotice = document.querySelector("#next-day-notice");
const calculationStatus = document.querySelector("#calculation-status");
const recalculateButton = document.querySelector("#recalculate");
const copyButton = document.querySelector("#copy-summary");
const pdfButton = document.querySelector("#save-pdf");
const saveSettingsButton = document.querySelector("#save-settings");
const copyStatus = document.querySelector("#copy-status");
const settingsStatus = document.querySelector("#settings-status");
const details = document.querySelector("#settings-panel");
const kilometerInput = document.querySelector("#kilometer-input");
const parkingInput = document.querySelector("#parking-input");

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR"
});

const numberFormatter = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

let calculationIsStale = false;
let settingsWasOpenBeforePrint = false;

function getSavedSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function readNumber(formData, name) {
  return Number(String(formData.get(name)).replace(",", "."));
}

function readCheckbox(formData, name) {
  return formData.get(name) === "on";
}

function getSettingsFromForm() {
  const formData = new FormData(settingsForm);
  return {
    dayRate: readNumber(formData, "dayRate"),
    normalDayHours: readNumber(formData, "normalDayHours"),
    vatPercent: DEFAULT_SETTINGS.vatPercent,
    enableHalfDayUnder6Hours: readCheckbox(formData, "enableHalfDayUnder6Hours"),
    enableOvertime10To12: readCheckbox(formData, "enableOvertime10To12"),
    enableOvertimeFrom12: readCheckbox(formData, "enableOvertimeFrom12"),
    enableOvertimeFrom14: readCheckbox(formData, "enableOvertimeFrom14"),
    enableNightTariff: readCheckbox(formData, "enableNightTariff"),
    pureNightFactor: DEFAULT_SETTINGS.pureNightFactor,
    nightOverlapSurchargeFactor: DEFAULT_SETTINGS.nightOverlapSurchargeFactor,
    nightStart: formData.get("nightStart"),
    nightEnd: formData.get("nightEnd"),
    nightRoundingMinutes: DEFAULT_SETTINGS.nightRoundingMinutes,
    kilometerRate: readNumber(formData, "kilometerRate")
  };
}

function populateSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    const field = settingsForm.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value;
    }
  });
}

function formatHours(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${numberFormatter.format(value)} uur`;
}

function formatEuro(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return euroFormatter.format(value);
}

function setResult(name, value, formatter = formatHours) {
  const el = document.querySelector(`[data-result="${name}"]`);
  if (el) el.textContent = formatter(value);
}

function buildSummary(result) {
  const date = form.elements.namedItem("date").value;
  const startTime = form.elements.namedItem("startTime").value;
  const endTime = form.elements.namedItem("endTime").value;
  const lines = [];

  if (date) {
    lines.push(`Datum: ${date}`);
  }

  lines.push(`Tijden: ${startTime} tot ${endTime}${result.endsNextDay ? " (volgende dag)" : ""}`);
  lines.push(`Totaal gewerkt: ${formatHours(result.totalHours)}`);

  if (result.overtimeHours > 0) {
    lines.push(`Overuren: ${formatHours(result.overtimeHours)}`);
  }

  if (result.nightHours > 0) {
    lines.push(`Nachturen: ${formatHours(result.nightHours)}`);
  }

  if (result.droneTariffAmount > 0) {
    lines.push(`Drone tarief: ${euroFormatter.format(result.droneTariffAmount)}`);
  }

  if (result.ronin4dTariffAmount > 0) {
    lines.push(`Ronin 4D tarief: ${euroFormatter.format(result.ronin4dTariffAmount)}`);
  }

  if (result.kilometerAmount > 0) {
    lines.push(`Kilometers: ${numberFormatter.format(result.kilometers)} km × ${euroFormatter.format(result.settings.kilometerRate)} = ${euroFormatter.format(result.kilometerAmount)}`);
  }

  if (result.parkingAmount > 0) {
    lines.push(`Parkeer/onkosten: ${euroFormatter.format(result.parkingAmount)}`);
  }

  lines.push(`Exclusief btw: ${euroFormatter.format(result.subtotalExVat)}`);

  return lines.join("\n");
}

function updateCalculation() {
  if (!form.reportValidity() || !settingsForm.reportValidity()) return;

  const settings = getSettingsFromForm();
  const formData = new FormData(form);

  const result = calculateTariff(
    {
      startTime: form.elements.namedItem("startTime").value,
      endTime: form.elements.namedItem("endTime").value,
      enableDroneTariff: readCheckbox(formData, "enableDroneTariff"),
      enableRonin4dTariff: readCheckbox(formData, "enableRonin4dTariff"),
      enableKilometers: readCheckbox(formData, "enableKilometers"),
      kilometers: readNumber(formData, "kilometers"),
      enableParkingCosts: readCheckbox(formData, "enableParkingCosts"),
      parkingCosts: readNumber(formData, "parkingCosts")
    },
    settings
  );

  setResult("totalHours", result.totalHours);
  setResult("overtimeHours", result.overtimeHours);
  setResult("overtime10To12Hours", result.overtime10To12Hours);
  setResult("overtimeFrom12Hours", result.overtimeFrom12Hours);
  setResult("overtimeFrom14Hours", result.overtimeFrom14Hours);
  setResult("nightHours", result.nightHours);
  setResult("nightOvertimeHours", result.nightOvertimeHours);
  setResult("pureNightHours", result.pureNightHours);
  setResult("baseAmount", result.baseAmount, formatEuro);
  setResult("overtimeAmount", result.overtimeAmount, formatEuro);
  setResult("nightAmount", result.nightAmount, formatEuro);
  setResult("droneTariffAmount", result.droneTariffAmount, formatEuro);
  setResult("ronin4dTariffAmount", result.ronin4dTariffAmount, formatEuro);
  setResult("kilometerAmount", result.kilometerAmount, formatEuro);
  setResult("parkingAmount", result.parkingAmount, formatEuro);
  setResult("subtotalExVat", result.subtotalExVat, formatEuro);
  setResult("vatAmount", result.vatAmount, formatEuro);
  setResult("totalIncVat", result.totalIncVat, formatEuro);

  nextDayNotice.hidden = !result.endsNextDay;
  form.dataset.summary = buildSummary(result);
  calculationIsStale = false;
  calculationStatus.hidden = true;
}

function saveCurrentSettings() {
  if (!settingsForm.reportValidity()) return;

  saveSettings(getSettingsFromForm());
  settingsStatus.textContent = "Instellingen opgeslagen.";
  setTimeout(() => {
    settingsStatus.textContent = "";
  }, 2500);
}

function updateNightSettingsVisibility() {
  const nightEnabled = settingsForm.elements.namedItem("enableNightTariff").checked;
  document.querySelector("#night-time-settings").hidden = !nightEnabled;
}

function updateKilometerVisibility() {
  const kilometersEnabled = form.elements.namedItem("enableKilometers").checked;
  kilometerInput.hidden = !kilometersEnabled;
}

function updateParkingVisibility() {
  const parkingEnabled = form.elements.namedItem("enableParkingCosts").checked;
  parkingInput.hidden = !parkingEnabled;
}

function markCalculationStale() {
  if (!form.dataset.summary) return;
  calculationIsStale = true;
  calculationStatus.hidden = false;
}

async function copySummary() {
  if (calculationIsStale) {
    copyStatus.textContent = "Bereken eerst opnieuw.";
    setTimeout(() => {
      copyStatus.textContent = "";
    }, 2000);
    return;
  }

  const summary = form.dataset.summary || "";

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(summary);
    } else {
      copyWithTextarea(summary);
    }

    copyStatus.textContent = "Gekopieerd";
  } catch {
    try {
      copyWithTextarea(summary);
      copyStatus.textContent = "Gekopieerd";
    } catch {
      copyStatus.textContent = "Kopiëren is niet toegestaan door de browser.";
    }
  }

  setTimeout(() => {
    copyStatus.textContent = "";
  }, 2000);
}

function copyWithTextarea(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Kopiëren mislukt.");
  }
}

function getTimeParts(value) {
  const [hour = "00", minute = "00"] = String(value).split(":");
  return {
    hour: HOURS.includes(hour) ? hour : "00",
    minute: QUARTER_HOURS.includes(minute) ? minute : "00"
  };
}

function setTimeValue(field, hour, minute) {
  field.value = `${hour}:${minute}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function closeTimePickers(exceptPicker) {
  document.querySelectorAll(".time-picker").forEach((picker) => {
    if (picker !== exceptPicker) picker.hidden = true;
  });
}

function renderTimePicker(field, picker) {
  const { hour: selectedHour, minute: selectedMinute } = getTimeParts(field.value);
  const hourColumn = picker.querySelector("[data-time-column='hours']");
  const minuteColumn = picker.querySelector("[data-time-column='minutes']");

  hourColumn.replaceChildren(
    ...HOURS.map((hour) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = hour;
      button.dataset.timePart = "hour";
      button.dataset.timeValue = hour;
      button.className = hour === selectedHour ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setTimeValue(field, hour, getTimeParts(field.value).minute);
        renderTimePicker(field, picker);
      });
      return button;
    })
  );

  minuteColumn.replaceChildren(
    ...QUARTER_HOURS.map((minute) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = minute;
      button.dataset.timePart = "minute";
      button.dataset.timeValue = minute;
      button.className = minute === selectedMinute ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setTimeValue(field, getTimeParts(field.value).hour, minute);
        picker.hidden = true;
      });
      return button;
    })
  );
}

function setupTimePicker(field) {
  const control = field.closest(".time-control");
  const trigger = control.querySelector(".time-picker-trigger");
  const picker = document.createElement("div");
  picker.className = "time-picker";
  picker.hidden = true;
  picker.innerHTML = `
    <div class="time-picker-column" data-time-column="hours" aria-label="Uren"></div>
    <div class="time-picker-column" data-time-column="minutes" aria-label="Minuten"></div>
  `;
  control.append(picker);

  picker.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  picker.addEventListener("touchstart", (event) => {
    event.stopPropagation();
  }, { passive: true });

  const openPicker = (event) => {
    event.stopPropagation();
    event.preventDefault();
    renderTimePicker(field, picker);
    closeTimePickers(picker);
    picker.hidden = false;
  };

  field.addEventListener("click", openPicker);
  trigger.addEventListener("click", openPicker);
  field.addEventListener("touchend", openPicker);
  trigger.addEventListener("touchend", openPicker);
}

populateSettings(getSavedSettings());
updateCalculation();
updateNightSettingsVisibility();
updateKilometerVisibility();
updateParkingVisibility();

document.querySelectorAll("[data-time-picker]").forEach(setupTimePicker);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".time-control")) closeTimePickers();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTimePickers();
});

form.addEventListener("input", markCalculationStale);
form.addEventListener("change", () => {
  updateKilometerVisibility();
  updateParkingVisibility();
  markCalculationStale();
});
settingsForm.addEventListener("input", markCalculationStale);
settingsForm.addEventListener("change", () => {
  updateNightSettingsVisibility();
  markCalculationStale();
});
recalculateButton.addEventListener("click", updateCalculation);
copyButton.addEventListener("click", copySummary);
saveSettingsButton.addEventListener("click", saveCurrentSettings);
pdfButton.addEventListener("click", () => window.print());

window.addEventListener("beforeprint", () => {
  settingsWasOpenBeforePrint = details.open;
  details.open = true;
  closeTimePickers();
});

window.addEventListener("afterprint", () => {
  details.open = settingsWasOpenBeforePrint;
});

details.addEventListener("toggle", () => {
  localStorage.setItem("cameraTariefSettingsOpen", String(details.open));
});
details.open = localStorage.getItem("cameraTariefSettingsOpen") === "true";
