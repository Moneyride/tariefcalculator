(function renderWorkrulesExamples() {
  "use strict";

  const params = new URLSearchParams(location.search);
  const backLink = document.querySelector(".legal-header-navigation a");
  if (backLink && params.get("source") === "guest") {
    backLink.href = "index.html";
    backLink.textContent = "Terug naar calculator";
  }
  let localSettings = {};
  try {
    localSettings = JSON.parse(localStorage.getItem("cameraTariefCalculatorSettings") || "{}");
  } catch (_) {
    localSettings = {};
  }

  const numeric = (name, fallback) => {
    const value = Number(params.get(name) ?? localSettings[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const dayRate = numeric("dayRate", 450);
  const normalDayHours = Math.max(1, numeric("normalDayHours", 10));
  const hourlyRate = dayRate / normalDayHours;
  const storedNightSurcharge = numeric("nightSurchargePercent", 100);
  const nightTotalPercent = params.has("nightTotalPercent")
    ? Math.max(100, numeric("nightTotalPercent", 200))
    : 100 + storedNightSurcharge;
  const nightExtraFactor = Math.max(0, (nightTotalPercent - 100) / 100);
  const withinEurope = numeric("travelWithinEuropePercent", 75);
  const outsideEurope = numeric("travelOutsideEuropePercent", 100);
  const overtimeFactor = 1.5;

  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });
  const setHtml = (id, html) => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = html;
  };

  setHtml("example-introduction", `De uitkomst volgt altijd jouw opgeslagen werkregels. Onderstaande voorbeelden gebruiken jouw dagtarief van <strong>${euro.format(dayRate)}</strong> en een normale werkdag van <strong>${number.format(normalDayHours)} uur</strong>.`);
  setHtml("example-base-rate", `Bij een dagtarief deelt Overuurtje het dagtarief door het ingestelde aantal normale uren. Bij ${euro.format(dayRate)} voor ${number.format(normalDayHours)} uur is het basisuurtarief <strong>${euro.format(hourlyRate)}</strong>. De eerste ${number.format(normalDayHours)} gewerkte uren vallen binnen de dagvergoeding.`);
  setHtml("example-overtime", `Een uur tegen 150% is ${euro.format(hourlyRate)} × 1,5 = <strong>${euro.format(hourlyRate * overtimeFactor)}</strong> boven op de dagvergoeding.`);
  setHtml("example-night-intro", `Nachturen zijn de gewerkte minuten binnen je ingestelde nachtperiode. Overuurtje toont het <strong>totale nachttarief</strong>: ${number.format(nightTotalPercent)}% betekent het gewone uur van 100% plus ${number.format(nightTotalPercent - 100)}% nachttoeslag.`);
  setHtml("example-night-regular", `Een normaal nachtuur tegen ${number.format(nightTotalPercent)}% bestaat uit het gewone uur van ${euro.format(hourlyRate)} plus ${euro.format(hourlyRate * nightExtraFactor)} nachttoeslag. De totale waarde van dat uur is <strong>${euro.format(hourlyRate * (1 + nightExtraFactor))}</strong>.`);
  setHtml("example-night-overtime", `Het nachttarief van ${number.format(nightTotalPercent)}% geldt voor het specifieke uur waarin je werkt, ook wanneer dat uur een overuur is. Een uur tegen 150% is ${euro.format(hourlyRate * overtimeFactor)}. De nachttoeslag over die uurwaarde is ${euro.format(hourlyRate * overtimeFactor * nightExtraFactor)}. Overuurtje toont deze onderdelen apart: de overuurvergoeding en de nachttoeslag.`);
  setHtml("example-travel", `Een reisdag is een percentage van het normale dagtarief. Met jouw instellingen is dat ${number.format(withinEurope)}% binnen Europa en ${number.format(outsideEurope)}% buiten Europa. Bij ${euro.format(dayRate)} is dat respectievelijk <strong>${euro.format(dayRate * withinEurope / 100)}</strong> en <strong>${euro.format(dayRate * outsideEurope / 100)}</strong>.`);
})();
