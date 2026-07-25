(function initializeProjectService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const STORAGE_KEY = "overuurtjeMockProjects";
  const PROJECT_COLUMNS = "id,user_id,name,client_name,start_date,end_date,notes,created_at,updated_at";
  const DAY_COLUMNS = "id,project_id,user_id,work_date,calculation_data,created_at,updated_at";

  const normalizeProject = (row) => ({
    id: row.id, userId: row.user_id, name: row.name, clientName: row.client_name || "",
    startDate: row.start_date, endDate: row.end_date, notes: row.notes || "",
    createdAt: row.created_at, updatedAt: row.updated_at
  });
  const normalizeDay = (row) => ({
    id: row.id, projectId: row.project_id, userId: row.user_id, workDate: row.work_date,
    calculationData: row.calculation_data || {}, createdAt: row.created_at, updatedAt: row.updated_at
  });
  const mockId = () => globalThis.crypto?.randomUUID?.() || `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const readMock = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } };
  const writeMock = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  const isMock = (options) => Boolean(options?.mock);

  async function client() {
    const value = await supabaseService.getClient();
    if (!value) throw new Error("Supabase is niet beschikbaar.");
    return value;
  }

  async function list(userId, options = {}) {
    if (isMock(options)) return Object.values(readMock()[userId]?.projects || {}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const db = await client();
    const { data, error } = await db.from("projects").select(PROJECT_COLUMNS).eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeProject);
  }

  async function get(userId, id, options = {}) {
    if (isMock(options)) {
      const store = readMock()[userId] || { projects: {}, days: {} };
      const project = store.projects?.[id];
      return project ? { project, days: Object.values(store.days || {}).filter((day) => day.projectId === id).sort((a, b) => a.workDate.localeCompare(b.workDate)) } : null;
    }
    const db = await client();
    const [{ data: projectRow, error: projectError }, { data: dayRows, error: dayError }] = await Promise.all([
      db.from("projects").select(PROJECT_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle(),
      db.from("project_days").select(DAY_COLUMNS).eq("project_id", id).eq("user_id", userId).order("work_date")
    ]);
    if (projectError) throw projectError;
    if (dayError) throw dayError;
    return projectRow ? { project: normalizeProject(projectRow), days: (dayRows || []).map(normalizeDay) } : null;
  }

  async function listDaysByDate(userId, workDate, options = {}) {
    if (isMock(options)) {
      const store = readMock()[userId] || { projects: {}, days: {} };
      return Object.values(store.days || {})
        .filter((day) => day.workDate === workDate)
        .map((day) => ({ day, project: store.projects?.[day.projectId] }))
        .filter((entry) => entry.project)
        .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
    }

    const db = await client();
    const { data: dayRows, error: dayError } = await db.from("project_days")
      .select(DAY_COLUMNS)
      .eq("user_id", userId)
      .eq("work_date", workDate)
      .order("updated_at", { ascending: false });
    if (dayError) throw dayError;
    if (!dayRows?.length) return [];

    const projectIds = [...new Set(dayRows.map((day) => day.project_id))];
    const { data: projectRows, error: projectError } = await db.from("projects")
      .select(PROJECT_COLUMNS)
      .eq("user_id", userId)
      .in("id", projectIds);
    if (projectError) throw projectError;

    const projectsById = new Map((projectRows || []).map((project) => [
      project.id,
      normalizeProject(project)
    ]));
    return dayRows
      .map((day) => ({
        day: normalizeDay(day),
        project: projectsById.get(day.project_id)
      }))
      .filter((entry) => entry.project);
  }

  async function saveProject(userId, values, options = {}) {
    const now = new Date().toISOString();
    if (isMock(options)) {
      const all = readMock(); const store = all[userId] || { projects: {}, days: {} };
      const old = values.id ? store.projects[values.id] : null;
      const project = { id: values.id || mockId(), userId, name: values.name.trim(), clientName: values.clientName?.trim() || "", startDate: values.startDate, endDate: values.endDate, notes: values.notes?.trim() || "", createdAt: old?.createdAt || now, updatedAt: now };
      store.projects[project.id] = project; all[userId] = store; writeMock(all); return project;
    }
    const db = await client();
    const payload = { user_id: userId, name: values.name.trim(), client_name: values.clientName?.trim() || null, start_date: values.startDate, end_date: values.endDate, notes: values.notes?.trim() || null };
    const query = values.id ? db.from("projects").update(payload).eq("id", values.id).eq("user_id", userId) : db.from("projects").insert(payload);
    const { data, error } = await query.select(PROJECT_COLUMNS).single();
    if (error) throw error;
    return normalizeProject(data);
  }

  async function replaceDays(userId, projectId, days, options = {}) {
    if (isMock(options)) {
      const all = readMock(); const store = all[userId] || { projects: {}, days: {} };
      Object.keys(store.days).forEach((id) => { if (store.days[id].projectId === projectId) delete store.days[id]; });
      days.forEach((item) => { const id = item.id || mockId(); const now = new Date().toISOString(); store.days[id] = { id, projectId, userId, workDate: item.workDate, calculationData: item.calculationData || {}, createdAt: now, updatedAt: now }; });
      if (store.projects[projectId]) store.projects[projectId].updatedAt = new Date().toISOString();
      all[userId] = store; writeMock(all); return get(userId, projectId, options);
    }
    const db = await client();
    const { data: existingRows, error: existingError } = await db.from("project_days")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (existingError) throw existingError;
    const incomingIds = new Set(days.map((day) => day.id).filter(Boolean));
    const removedIds = (existingRows || []).map((row) => row.id).filter((id) => !incomingIds.has(id));
    if (removedIds.length) {
      const { error: deleteError } = await db.from("project_days")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .in("id", removedIds);
      if (deleteError) throw deleteError;
    }
    if (days.length) {
      const payload = days.map((day) => ({
        ...(day.id ? { id: day.id } : {}),
        project_id: projectId,
        user_id: userId,
        work_date: day.workDate,
        calculation_data: day.calculationData || {}
      }));
      const { error } = await db.from("project_days").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    }
    await db.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId).eq("user_id", userId);
    return get(userId, projectId, options);
  }

  async function remove(userId, id, options = {}) {
    if (isMock(options)) {
      const all = readMock(); const store = all[userId] || { projects: {}, days: {} };
      delete store.projects[id]; Object.keys(store.days).forEach((dayId) => { if (store.days[dayId].projectId === id) delete store.days[dayId]; });
      all[userId] = store; writeMock(all); return;
    }
    const db = await client();
    const { error } = await db.from("projects").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }

  globalThis.OveruurtjeProjects = Object.freeze({
    normalizeProject,
    normalizeDay,
    list,
    get,
    listDaysByDate,
    saveProject,
    replaceDays,
    remove
  });
})();
