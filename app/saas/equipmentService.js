(function initializeEquipmentService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const COLUMNS = "id,user_id,name,amount,is_visible,created_at,updated_at";

  function normalize(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: String(row.name || "").trim(),
      amount: Number(row.amount) || 0,
      isVisible: Boolean(row.is_visible),
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
      .from("equipment")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalize);
  }

  async function create(userId, values) {
    const client = await getClient();
    const { data, error } = await client
      .from("equipment")
      .insert({
        user_id: userId,
        name: String(values.name || "").trim(),
        amount: Math.max(0, Number(values.amount) || 0),
        is_visible: values.isVisible !== false
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data);
  }

  async function update(userId, id, values) {
    const client = await getClient();
    const { data, error } = await client
      .from("equipment")
      .update({
        name: String(values.name || "").trim(),
        amount: Math.max(0, Number(values.amount) || 0),
        is_visible: Boolean(values.isVisible)
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data);
  }

  async function remove(userId, id) {
    const client = await getClient();
    const { error } = await client.from("equipment").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }

  globalThis.OveruurtjeEquipment = Object.freeze({ normalize, list, create, update, remove });
})();
