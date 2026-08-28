/* Saros Simple Card for Home Assistant 2026.8+
 * No external dependencies. Configure the card from the dashboard YAML.
 */

class SarosSimpleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._room = "all";
    this._mode = "";
    this._busy = false;
    this._error = "";
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Vul de vacuum-entiteit in");
    }
    if (!config.cleaning_mode_entity) {
      throw new Error("Vul de entiteit voor de schoonmaakmodus in");
    }

    this._config = {
      name: "Saros 20",
      rooms: [],
      ...config,
    };

    if (!this._roomExists(this._room)) {
      this._room = "all";
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const modeEntity = hass.states[this._config?.cleaning_mode_entity];
    const options = modeEntity?.attributes?.options || [];

    if (!this._mode || !options.includes(this._mode)) {
      this._mode = modeEntity?.state || options[0] || "";
    }
    this._render();
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return {
      columns: 6,
      min_columns: 6,
      rows: 7,
      min_rows: 6,
    };
  }

  static getStubConfig() {
    return {
      entity: "vacuum.saros_20",
      cleaning_mode_entity: "select.saros_20_schoonmaakmodus",
      name: "Saros 20",
      rooms: [],
    };
  }

  _roomExists(value) {
    if (value === "all") return true;
    return (this._config?.rooms || []).some((room) => room.area_id === value);
  }

  _normalise(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  _modeLabel(option) {
    const value = this._normalise(option);
    const hasThen = /(then|daarna|after|follow)/.test(value);
    const hasVacuum = /(vac|stof|sweep)/.test(value);
    const hasMop = /(mop|dweil)/.test(value);

    if (hasThen && hasVacuum && hasMop) return "Stofzuigen, dan dweilen";
    if (hasVacuum && hasMop) return "Stofzuigen en dweilen";
    if (hasMop && !hasVacuum) return "Dweilen";
    if (hasVacuum && !hasMop) return "Stofzuigen";
    return String(option).replaceAll("_", " ");
  }

  _statusLabel(state) {
    const labels = {
      cleaning: "Bezig met schoonmaken",
      docked: "In het dock",
      paused: "Gepauzeerd",
      idle: "Klaar voor gebruik",
      returning: "Terug naar het dock",
      error: "Storing",
      unavailable: "Niet beschikbaar",
      unknown: "Status onbekend",
    };
    return labels[state] || String(state || "Onbekend").replaceAll("_", " ");
  }

  _isMoving(state) {
    return ["cleaning", "returning"].includes(state);
  }

  _battery(vacuum) {
    const raw = vacuum?.attributes?.battery_level ?? vacuum?.attributes?.battery;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  _roomGroups() {
    const groups = new Map();
    for (const room of this._config?.rooms || []) {
      const group = room.floor || "Ruimtes";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(room);
    }
    return groups;
  }

  _renderRoomOptions() {
    let html = '<option value="all">Alles (huidige verdieping)</option>';
    for (const [group, rooms] of this._roomGroups()) {
      html += `<optgroup label="${this._escape(group)}">`;
      for (const room of rooms) {
        html += `<option value="${this._escape(room.area_id)}" ${
          this._room === room.area_id ? "selected" : ""
        }>${this._escape(room.name)}</option>`;
      }
      html += "</optgroup>";
    }
    return html;
  }

  _renderModeOptions(modeEntity) {
    const options = modeEntity?.attributes?.options || [];
    return options
      .map(
        (option) =>
          `<option value="${this._escape(option)}" ${
            this._mode === option ? "selected" : ""
          }>${this._escape(this._modeLabel(option))}</option>`,
      )
      .join("");
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  _robotSvg() {
    return `
      <svg class="robot-svg" viewBox="0 0 260 190" role="img" aria-label="Schematische robotstofzuiger">
        <defs>
          <linearGradient id="robotBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="1" stop-color="#dfe5e8" />
          </linearGradient>
          <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="9" stdDeviation="8" flood-opacity=".24" />
          </filter>
        </defs>
        <ellipse class="floor-shadow" cx="130" cy="159" rx="82" ry="14" />
        <g class="robot-body" filter="url(#shadow)">
          <circle cx="130" cy="92" r="72" fill="url(#robotBody)" stroke="#b8c1c6" stroke-width="3" />
          <circle cx="130" cy="92" r="57" fill="none" stroke="#cbd2d6" stroke-width="2" />
          <path d="M77 61 Q130 29 183 61" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".8" />
          <g class="lidar">
            <circle cx="130" cy="66" r="20" fill="#25343b" stroke="#11191d" stroke-width="3" />
            <circle cx="130" cy="66" r="9" fill="#39bde7" />
            <path d="M130 57v18M121 66h18" stroke="#d9f7ff" stroke-width="2" opacity=".9" />
          </g>
          <rect x="105" y="119" width="50" height="9" rx="4.5" fill="#c2cbd0" />
          <circle cx="130" cy="142" r="4" fill="#39bde7" />
        </g>
        <g class="side-brush" stroke="#6f7c82" stroke-width="4" stroke-linecap="round">
          <path d="M194 130l22 11" />
          <path d="M197 128l5 24" />
          <path d="M194 132l20-13" />
        </g>
      </svg>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const vacuum = this._hass?.states?.[this._config.entity];
    const modeEntity = this._hass?.states?.[this._config.cleaning_mode_entity];
    const state = vacuum?.state || "unknown";
    const battery = this._battery(vacuum);
    const moving = this._isMoving(state);
    const unavailable = !vacuum || state === "unavailable";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --saros-accent: var(--primary-color, #03a9d9);
          --saros-surface: var(--ha-card-background, var(--card-background-color, #fff));
          --saros-muted: var(--secondary-text-color, #6f777d);
          --saros-border: color-mix(in srgb, var(--primary-text-color, #111) 13%, transparent);
        }
        * { box-sizing: border-box; }
        ha-card {
          overflow: hidden;
          padding: 20px;
          color: var(--primary-text-color);
          background: var(--saros-surface);
        }
        .top {
          display: grid;
          grid-template-columns: minmax(148px, .9fr) minmax(170px, 1.1fr);
          align-items: center;
          gap: 10px;
          min-height: 184px;
        }
        .visual {
          position: relative;
          display: grid;
          place-items: center;
          min-width: 0;
        }
        .robot-svg { width: min(100%, 250px); overflow: visible; }
        .floor-shadow { fill: var(--primary-text-color); opacity: .14; }
        .side-brush { transform-origin: 197px 131px; }
        .moving .robot-body { animation: travel 1.7s ease-in-out infinite; transform-origin: 130px 92px; }
        .moving .side-brush { animation: spin .75s linear infinite; }
        .moving .floor-shadow { animation: shadowPulse 1.7s ease-in-out infinite; }
        .returning .robot-body { animation-duration: 2.4s; }
        .details { min-width: 0; padding-right: 4px; }
        .name {
          margin: 0 0 5px;
          font-size: 22px;
          font-weight: 650;
          line-height: 1.2;
        }
        .status-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .status-dot {
          width: 9px;
          height: 9px;
          flex: 0 0 9px;
          border-radius: 50%;
          background: ${state === "error" ? "var(--error-color, #db4437)" : "var(--saros-accent)"};
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--saros-accent) 18%, transparent);
        }
        .status { color: var(--saros-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .battery-wrap { margin-top: 22px; }
        .battery-label { display: flex; justify-content: space-between; font-size: 13px; color: var(--saros-muted); }
        .battery-track { height: 7px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: var(--saros-border); }
        .battery-level {
          width: ${battery ?? 0}%;
          height: 100%;
          border-radius: inherit;
          background: ${battery !== null && battery < 20 ? "var(--warning-color, #f29f05)" : "var(--saros-accent)"};
          transition: width .35s ease;
        }
        .divider { height: 1px; margin: 12px 0 18px; background: var(--saros-border); }
        .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        label { display: block; min-width: 0; }
        .field-label { display: block; margin: 0 0 7px 2px; color: var(--saros-muted); font-size: 12px; font-weight: 600; }
        select {
          width: 100%;
          min-height: 46px;
          appearance: none;
          border: 1px solid var(--saros-border);
          border-radius: 12px;
          padding: 0 38px 0 13px;
          color: var(--primary-text-color);
          background:
            linear-gradient(45deg, transparent 50%, var(--saros-muted) 50%) calc(100% - 18px) 20px / 5px 5px no-repeat,
            linear-gradient(135deg, var(--saros-muted) 50%, transparent 50%) calc(100% - 13px) 20px / 5px 5px no-repeat,
            color-mix(in srgb, var(--saros-surface) 96%, var(--primary-text-color));
          font: inherit;
          outline: none;
        }
        select:focus { border-color: var(--saros-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--saros-accent) 20%, transparent); }
        select:disabled { opacity: .55; }
        .actions { display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: 9px; margin-top: 16px; }
        button {
          min-width: 0;
          min-height: 48px;
          border: 1px solid var(--saros-border);
          border-radius: 13px;
          color: var(--primary-text-color);
          background: color-mix(in srgb, var(--saros-surface) 94%, var(--primary-text-color));
          font: inherit;
          font-weight: 620;
          cursor: pointer;
          transition: transform .12s ease, background .12s ease, opacity .12s ease;
        }
        button:hover:not(:disabled) { background: color-mix(in srgb, var(--saros-surface) 87%, var(--primary-text-color)); }
        button:active:not(:disabled) { transform: scale(.97); }
        button:disabled { cursor: default; opacity: .46; }
        .start { color: var(--text-primary-color, #fff); background: var(--saros-accent); border-color: transparent; }
        .start:hover:not(:disabled) { background: color-mix(in srgb, var(--saros-accent) 86%, #000); }
        .button-icon { margin-right: 6px; font-size: 16px; }
        .error { margin-top: 12px; color: var(--error-color, #db4437); font-size: 13px; line-height: 1.35; }
        @keyframes travel { 0%, 100% { transform: translateX(-3px) rotate(-1deg); } 50% { transform: translateX(3px) rotate(1deg); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shadowPulse { 0%, 100% { transform: scaleX(.96); opacity: .12; } 50% { transform: scaleX(1.04); opacity: .17; } }
        @media (max-width: 460px) {
          ha-card { padding: 16px; }
          .top { grid-template-columns: 42% 58%; min-height: 150px; gap: 2px; }
          .robot-svg { width: 180px; transform: translateX(-8px); }
          .name { font-size: 19px; }
          .status { font-size: 13px; }
          .battery-wrap { margin-top: 15px; }
          .fields { grid-template-columns: 1fr; gap: 10px; }
          .actions { grid-template-columns: repeat(4, 1fr); }
          .button-label { display: none; }
          .button-icon { margin: 0; font-size: 19px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .moving .robot-body, .moving .side-brush, .moving .floor-shadow { animation: none; }
        }
      </style>
      <ha-card>
        <div class="top ${moving ? "moving" : ""} ${state === "returning" ? "returning" : ""}">
          <div class="visual">${this._robotSvg()}</div>
          <div class="details">
            <h2 class="name">${this._escape(this._config.name)}</h2>
            <div class="status-row">
              <span class="status-dot"></span>
              <span class="status">${this._escape(this._statusLabel(state))}</span>
            </div>
            <div class="battery-wrap">
              <div class="battery-label"><span>Batterij</span><span>${battery === null ? "—" : `${battery}%`}</span></div>
              <div class="battery-track"><div class="battery-level"></div></div>
            </div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="fields">
          <label>
            <span class="field-label">WAAR</span>
            <select id="room" ${this._busy || unavailable ? "disabled" : ""}>${this._renderRoomOptions()}</select>
          </label>
          <label>
            <span class="field-label">PROGRAMMA</span>
            <select id="mode" ${this._busy || unavailable || !modeEntity ? "disabled" : ""}>${this._renderModeOptions(modeEntity)}</select>
          </label>
        </div>
        <div class="actions">
          <button class="start" data-action="start" title="Starten" aria-label="Starten" ${this._busy || unavailable || !this._mode ? "disabled" : ""}>
            <span class="button-icon">▶</span><span class="button-label">Start</span>
          </button>
          <button data-action="pause" title="Pauzeren" aria-label="Pauzeren" ${this._busy || unavailable || state !== "cleaning" ? "disabled" : ""}>
            <span class="button-icon">Ⅱ</span><span class="button-label">Pauze</span>
          </button>
          <button data-action="stop" title="Stoppen" aria-label="Stoppen" ${this._busy || unavailable || !["cleaning", "paused", "returning"].includes(state) ? "disabled" : ""}>
            <span class="button-icon">■</span><span class="button-label">Stop</span>
          </button>
          <button data-action="dock" title="Terug naar dock" aria-label="Terug naar dock" ${this._busy || unavailable || state === "docked" ? "disabled" : ""}>
            <span class="button-icon">⌂</span><span class="button-label">Dock</span>
          </button>
        </div>
        ${this._error ? `<div class="error">${this._escape(this._error)}</div>` : ""}
      </ha-card>`;

    this.shadowRoot.getElementById("room")?.addEventListener("change", (event) => {
      this._room = event.target.value;
    });
    this.shadowRoot.getElementById("mode")?.addEventListener("change", (event) => {
      this._mode = event.target.value;
    });
    this.shadowRoot.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => this._perform(button.dataset.action));
    });
  }

  async _perform(action) {
    if (!this._hass || this._busy) return;
    this._busy = true;
    this._error = "";
    this._render();

    try {
      const target = { entity_id: this._config.entity };

      if (action === "start") {
        await this._hass.callService(
          "select",
          "select_option",
          { option: this._mode },
          { entity_id: this._config.cleaning_mode_entity },
        );

        if (this._room === "all") {
          await this._hass.callService("vacuum", "start", {}, target);
        } else {
          await this._hass.callService(
            "vacuum",
            "clean_area",
            { cleaning_area_id: [this._room] },
            target,
          );
        }
      } else {
        const service = {
          pause: "pause",
          stop: "stop",
          dock: "return_to_base",
        }[action];
        if (service) await this._hass.callService("vacuum", service, {}, target);
      }
    } catch (error) {
      this._error = error?.message || "De opdracht kon niet worden uitgevoerd.";
    } finally {
      this._busy = false;
      this._render();
    }
  }
}

if (!customElements.get("saros-simple-card")) {
  customElements.define("saros-simple-card", SarosSimpleCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "saros-simple-card")) {
  window.customCards.push({
    type: "saros-simple-card",
    name: "Saros eenvoudige bediening",
    description: "Rustige bedieningskaart voor een Roborock Saros.",
    preview: false,
    documentationURL: "https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card",
  });
}
