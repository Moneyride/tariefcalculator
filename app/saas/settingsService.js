(function initializeSettingsService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const SETTINGS_COLUMNS = "user_id,default_department,default_day_rate,mileage_rate,parking_default_amount,drone_enabled,ronin_enabled,drone_tariff_amount,ronin_tariff_amount,preferences,updated_at";
  const defaults = Object.freeze({
    defaultDepartment: "camera",
    defaultDayRate: 450,
    defaultRateMode: "day",
    defaultHourlyRate: 45,
    defaultBreakMinutes: 0,
    enableBreak: false,
    normalDayHours: 10,
    minimumHours: 1,
    enableHalfDayUnder6Hours: false,
    enableOvertime10To12: true,
    enableOvertimeFrom12: true,
    enableOvertimeFrom14: false,
    enableNightTariff: true,
    nightStart: "00:00",
    nightEnd: "06:00",
    mileageRate: 0.23,
    parkingDefaultAmount: 0,
    droneVisible: false,
    roninVisible: false,
    droneTariffAmount: 50,
    roninTariffAmount: 50,
    preferences: {}
  });

  function normalizeMinimumHours(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(12, Math.max(0, parsed)) : defaults.minimumHours;
  }

  function normalize(row = {}) {
    const preferences = row.preferences && typeof row.preferences === "object" ? row.preferences : {};
    const booleanPreference = (name, fallback) => typeof preferences[name] === "boolean" ? preferences[name] : fallback;
    const timePreference = (name, fallback) => /^\d{2}:\d{2}$/.test(preferences[name] || "") ? preferences[name] : fallback;
    return {
      defaultDepartment: row.default_department === "audio" ? "audio" : "camera",
      defaultDayRate: Number(row.default_day_rate ?? defaults.defaultDayRate),
      defaultRateMode: preferences.defaultRateMode === "hour" ? "hour" : "day",
      defaultHourlyRate: Number(preferences.defaultHourlyRate ?? defaults.defaultHourlyRate),
      defaultBreakMinutes: Math.max(0, Number(preferences.defaultBreakMinutes ?? defaults.defaultBreakMinutes)),
      enableBreak: booleanPreference("enableBreak", defaults.enableBreak),
      normalDayHours: Number(preferences.normalDayHours) === 12 ? 12 : 10,
      minimumHours: normalizeMinimumHours(preferences.minimumHours),
      enableHalfDayUnder6Hours: booleanPreference("enableHalfDayUnder6Hours", defaults.enableHalfDayUnder6Hours),
      enableOvertime10To12: booleanPreference("enableOvertime10To12", defaults.enableOvertime10To12),
      enableOvertimeFrom12: booleanPreference("enableOvertimeFrom12", defaults.enableOvertimeFrom12),
      enableOvertimeFrom14: booleanPreference("enableOvertimeFrom14", defaults.enableOvertimeFrom14),
      enableNightTariff: booleanPreference("enableNightTariff", defaults.enableNightTariff),
      nightStart: timePreference("nightStart", defaults.nightStart),
      nightEnd: timePreference("nightEnd", defaults.nightEnd),
      mileageRate: Number(row.mileage_rate ?? defaults.mileageRate),
      parkingDefaultAmount: Number(row.parking_default_amount ?? 0),
      droneVisible: Boolean(row.drone_enabled),
      roninVisible: Boolean(row.ronin_enabled),
      droneTariffAmount: Number(row.drone_tariff_amount ?? defaults.droneTariffAmount),
      roninTariffAmount: Number(row.ronin_tariff_amount ?? defaults.roninTariffAmount),
      preferences
    };
  }

  function serialize(userId, values) {
    const settings = { ...defaults, ...values };
    return {
      user_id: userId,
      default_department: settings.defaultDepartment === "audio" ? "audio" : "camera",
      default_day_rate: Number(settings.defaultDayRate) || 0,
      mileage_rate: Number(settings.mileageRate) || 0,
      parking_default_amount: Number(settings.parkingDefaultAmount) || 0,
      drone_enabled: Boolean(settings.droneVisible),
      ronin_enabled: Boolean(settings.roninVisible),
      drone_tariff_amount: Math.max(0, Number(settings.droneTariffAmount) || 0),
      ronin_tariff_amount: Math.max(0, Number(settings.roninTariffAmount) || 0),
      preferences: {
        ...(settings.preferences || {}),
        defaultRateMode: settings.defaultRateMode === "hour" ? "hour" : "day",
        defaultHourlyRate: Math.max(0, Number(settings.defaultHourlyRate) || 0),
        defaultBreakMinutes: Math.max(0, Number(settings.defaultBreakMinutes) || 0),
        enableBreak: Boolean(settings.enableBreak),
        normalDayHours: Number(settings.normalDayHours) === 12 ? 12 : 10,
        minimumHours: normalizeMinimumHours(settings.minimumHours),
        enableHalfDayUnder6Hours: Boolean(settings.enableHalfDayUnder6Hours),
        enableOvertime10To12: Boolean(settings.enableOvertime10To12),
        enableOvertimeFrom12: Boolean(settings.enableOvertimeFrom12),
        enableOvertimeFrom14: Boolean(settings.enableOvertimeFrom14),
        enableNightTariff: Boolean(settings.enableNightTariff),
        nightStart: /^\d{2}:\d{2}$/.test(settings.nightStart || "") ? settings.nightStart : defaults.nightStart,
        nightEnd: /^\d{2}:\d{2}$/.test(settings.nightEnd || "") ? settings.nightEnd : defaults.nightEnd
      },
      updated_at: new Date().toISOString()
    };
  }

  async function load(userId) {
    if (!userId) return null;
    const client = await supabaseService.getClient();
    if (!client) return null;

    const { data, error } = await client
      .from("settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data ? normalize(data) : null;
  }

  async function save(userId, values) {
    if (!userId) return null;
    const client = await supabaseService.getClient();
    if (!client) return null;

    const { data, error } = await client
      .from("settings")
      .upsert(serialize(userId, values), { onConflict: "user_id" })
      .select(SETTINGS_COLUMNS)
      .single();

    if (error) throw error;
    return normalize(data);
  }

  globalThis.OveruurtjeSettings = Object.freeze({ defaults, normalize, serialize, load, save });
})();
