(function initializeSettingsService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const SETTINGS_COLUMNS = "user_id,default_department,default_hourly_rate,mileage_rate,parking_enabled,parking_default_amount,drone_enabled,ronin_enabled,preferences,updated_at";
  const defaults = Object.freeze({
    defaultDepartment: "camera",
    defaultHourlyRate: 45,
    mileageRate: 0.23,
    parkingEnabled: false,
    parkingDefaultAmount: 0,
    droneEnabled: false,
    roninEnabled: false,
    preferences: {}
  });

  function normalize(row = {}) {
    return {
      defaultDepartment: row.default_department === "audio" ? "audio" : "camera",
      defaultHourlyRate: Number(row.default_hourly_rate ?? defaults.defaultHourlyRate),
      mileageRate: Number(row.mileage_rate ?? defaults.mileageRate),
      parkingEnabled: Boolean(row.parking_enabled),
      parkingDefaultAmount: Number(row.parking_default_amount ?? 0),
      droneEnabled: Boolean(row.drone_enabled),
      roninEnabled: Boolean(row.ronin_enabled),
      preferences: row.preferences && typeof row.preferences === "object" ? row.preferences : {}
    };
  }

  function serialize(userId, values) {
    const settings = { ...defaults, ...values };
    return {
      user_id: userId,
      default_department: settings.defaultDepartment === "audio" ? "audio" : "camera",
      default_hourly_rate: Number(settings.defaultHourlyRate) || 0,
      mileage_rate: Number(settings.mileageRate) || 0,
      parking_enabled: Boolean(settings.parkingEnabled),
      parking_default_amount: Number(settings.parkingDefaultAmount) || 0,
      drone_enabled: Boolean(settings.droneEnabled),
      ronin_enabled: Boolean(settings.roninEnabled),
      preferences: settings.preferences || {},
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
