(function initializeWorkdayService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const STORAGE_KEY = "overuurtjeMockWorkdays";
  const COLUMNS = "id,user_id,name,work_date,calculation_data,sharing_only,created_at,updated_at";

  const normalize = (row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name || "",
    workDate: row.work_date,
    calculationData: row.calculation_data || {},
    sharingOnly: Boolean(row.sharing_only),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
  const mockId = () => globalThis.crypto?.randomUUID?.()
    || `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const readMock = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  };
  const writeMock = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  const useMock = (options) => Boolean(options?.mock);

  async function client() {
    const value = await supabaseService.getClient();
    if (!value) throw new Error("Supabase is niet beschikbaar.");
    return value;
  }

  async function list(userId, options = {}) {
    if (useMock(options)) {
      return Object.values(readMock()[userId] || {})
        .sort((a, b) => b.workDate.localeCompare(a.workDate) || b.updatedAt.localeCompare(a.updatedAt));
    }
    const db = await client();
    const { data, error } = await db.from("workdays")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("sharing_only", false)
      .order("work_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalize);
  }

  async function get(userId, id, options = {}) {
    if (useMock(options)) return readMock()[userId]?.[id] || null;
    const db = await client();
    const { data, error } = await db.from("workdays")
      .select(COLUMNS)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("sharing_only", false)
      .maybeSingle();
    if (error) throw error;
    return data ? normalize(data) : null;
  }

  async function listByDate(userId, workDate, options = {}) {
    if (useMock(options)) {
      return Object.values(readMock()[userId] || {})
        .filter((item) => item.workDate === workDate)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const db = await client();
    const { data, error } = await db.from("workdays")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("work_date", workDate)
      .eq("sharing_only", false)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalize);
  }

  async function save(userId, values, options = {}) {
    const now = new Date().toISOString();
    if (useMock(options)) {
      const all = readMock();
      const userWorkdays = all[userId] || {};
      const old = values.id ? userWorkdays[values.id] : null;
      const workday = {
        id: values.id || mockId(),
        userId,
        name: String(values.name || "").trim(),
        workDate: values.workDate,
        calculationData: values.calculationData || {},
        createdAt: old?.createdAt || now,
        updatedAt: now
      };
      userWorkdays[workday.id] = workday;
      all[userId] = userWorkdays;
      writeMock(all);
      return workday;
    }
    const db = await client();
    const payload = {
      user_id: userId,
      name: String(values.name || "").trim() || null,
      work_date: values.workDate,
      calculation_data: values.calculationData || {},
      sharing_only: false
    };
    const query = values.id
      ? db.from("workdays").update(payload).eq("id", values.id).eq("user_id", userId)
      : db.from("workdays").insert(payload);
    const { data, error } = await query.select(COLUMNS).single();
    if (error) throw error;
    return normalize(data);
  }

  async function remove(userId, id, options = {}) {
    if (useMock(options)) {
      const all = readMock();
      if (all[userId]) delete all[userId][id];
      writeMock(all);
      return;
    }
    const db = await client();
    const { error } = await db.from("workdays").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }

  globalThis.OveruurtjeWorkdays = Object.freeze({ normalize, list, get, listByDate, save, remove });
})();
