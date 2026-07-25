(function initializeFunctionService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const COLUMNS = "id,user_id,name,department,day_rate,is_default,sort_order,created_at,updated_at";
  const STANDARD_FUNCTIONS = Object.freeze([
    Object.freeze({ name: "Camera", department: "camera", dayRate: 450, sortOrder: 0 }),
    Object.freeze({ name: "Audio", department: "audio", dayRate: 395, sortOrder: 1 })
  ]);

  function normalize(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: String(row.name || "").trim(),
      department: row.department === "audio" ? "audio" : "camera",
      dayRate: Math.max(0, Number(row.day_rate) || 0),
      isDefault: Boolean(row.is_default),
      sortOrder: Number(row.sort_order) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function getClient() {
    const client = await supabaseService.getClient();
    if (!client) throw new Error("Supabase is niet beschikbaar.");
    return client;
  }

  async function list(userId) {
    if (!userId) return [];
    const client = await getClient();
    const { data, error } = await client
      .from("work_functions")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalize);
  }

  async function create(userId, values) {
    const client = await getClient();
    const { data, error } = await client
      .from("work_functions")
      .insert({
        user_id: userId,
        name: String(values.name || "").trim(),
        department: values.department === "audio" ? "audio" : "camera",
        day_rate: Math.max(0, Number(values.dayRate) || 0),
        is_default: Boolean(values.isDefault),
        sort_order: Number(values.sortOrder) || 0
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data);
  }

  async function update(userId, id, values) {
    const client = await getClient();
    const { data, error } = await client
      .from("work_functions")
      .update({
        name: String(values.name || "").trim(),
        department: values.department === "audio" ? "audio" : "camera",
        day_rate: Math.max(0, Number(values.dayRate) || 0),
        is_default: Boolean(values.isDefault),
        sort_order: Number(values.sortOrder) || 0
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data);
  }

  async function setDefault(userId, id) {
    const client = await getClient();
    const { error: clearError } = await client
      .from("work_functions")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
    if (clearError) throw clearError;

    const { data, error } = await client
      .from("work_functions")
      .update({ is_default: true })
      .eq("id", id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data);
  }

  async function remove(userId, id) {
    const client = await getClient();
    const { error } = await client
      .from("work_functions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  function isStandard(item) {
    const name = String(item?.name || "").trim().toLocaleLowerCase("nl");
    return STANDARD_FUNCTIONS.some((standard) => standard.name.toLocaleLowerCase("nl") === name);
  }

  async function ensureStandards(userId, items, settings = {}) {
    const existing = [...(items || [])];
    const defaultDepartment = settings.defaultDepartment === "audio" ? "audio" : "camera";
    const hasDefault = existing.some((item) => item.isDefault);

    for (const standard of STANDARD_FUNCTIONS) {
      if (existing.some((item) => item.name.toLocaleLowerCase("nl") === standard.name.toLocaleLowerCase("nl"))) continue;
      const created = await create(userId, {
        ...standard,
        dayRate: standard.department === defaultDepartment && Number.isFinite(Number(settings.defaultDayRate))
          ? Number(settings.defaultDayRate)
          : standard.dayRate,
        isDefault: !hasDefault && standard.department === defaultDepartment
      });
      existing.push(created);
    }

    if (!existing.some((item) => item.isDefault) && existing.length) {
      const preferred = existing.find((item) => item.department === defaultDepartment) || existing[0];
      await setDefault(userId, preferred.id);
      return list(userId);
    }
    return existing.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  globalThis.OveruurtjeFunctions = Object.freeze({
    standardFunctions: STANDARD_FUNCTIONS,
    normalize,
    list,
    create,
    update,
    setDefault,
    remove,
    isStandard,
    ensureStandards
  });
})();
