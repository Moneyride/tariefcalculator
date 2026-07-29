(function initializeShareService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;

  async function client() {
    const value = await supabaseService.getClient();
    if (!value) throw new Error("Supabase is niet beschikbaar.");
    return value;
  }

  async function rpc(name, values = {}) {
    const db = await client();
    const { data, error } = await db.rpc(name, values);
    if (error) throw error;
    return data;
  }

  const normalizeReceived = (row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name || "Een collega",
    workDate: row.work_date,
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    projectName: row.project_name || "",
    workdayName: row.workday_name || "",
    optionalMessage: row.optional_message || "",
    shareMode: row.share_mode,
    acceptedAt: row.accepted_at,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at
  });

  const normalizeSent = (row) => ({
    id: row.id,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name || "",
    recipientEmail: row.recipient_email || "",
    optionalMessage: row.optional_message || "",
    shareMode: row.share_mode,
    deliveredAt: row.delivered_at,
    acceptedAt: row.accepted_at
  });

  const normalizeNotification = (row) => ({
    id: row.id,
    type: row.notification_type,
    shareId: row.share_id,
    sourceType: row.source_type || "",
    sourceId: row.source_id || "",
    actorName: row.actor_name || "Een collega",
    readAt: row.read_at,
    createdAt: row.created_at
  });

  const normalizeInvite = (row) => ({
    token: row.token,
    ownerName: row.owner_name || "Een collega",
    sourceType: row.source_type,
    sourceId: row.source_id,
    workDate: row.work_date,
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    projectName: row.project_name || "",
    workdayName: row.workday_name || "",
    optionalMessage: row.optional_message || "",
    shareMode: row.share_mode,
    available: row.available !== false
  });

  async function createInvite({ sourceType, sourceId, message = "", shareMode = "direct" }) {
    return rpc("create_workday_share_invite", {
      p_source_type: sourceType,
      p_source_id: sourceId,
      p_message: message,
      p_share_mode: shareMode
    });
  }

  async function previewInvite(token) {
    const rows = await rpc("preview_workday_share_invite", { p_token: token });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? normalizeInvite(row) : null;
  }

  async function claimInvite(token) {
    return rpc("claim_workday_share_invite", { p_token: token });
  }

  async function listReceived() {
    return (await rpc("get_received_workday_shares") || []).map(normalizeReceived);
  }

  async function listSent(sourceType, sourceId) {
    return (await rpc("get_sent_workday_shares", {
      p_source_type: sourceType,
      p_source_id: sourceId
    }) || [])
      .map(normalizeSent)
      .sort((a, b) => a.recipientName.localeCompare(b.recipientName, "nl"));
  }

  async function listParticipants(sourceType, sourceId) {
    return (await rpc("get_workday_share_participants", {
      p_source_type: sourceType,
      p_source_id: sourceId
    }) || []).map((row) => ({
      userId: row.user_id,
      firstName: row.first_name || "Collega",
      isOwner: Boolean(row.is_owner),
      isCurrentUser: Boolean(row.is_current_user),
      hasAccount: row.has_account !== false
    }));
  }

  async function accept(id) {
    await rpc("accept_workday_share", { p_share_id: id });
  }

  async function remove(id) {
    await rpc("remove_workday_share", { p_share_id: id });
  }

  async function listNotifications() {
    return (await rpc("list_overuurtje_notifications") || []).map(normalizeNotification);
  }

  async function markNotificationsRead(ids = null) {
    await rpc("mark_overuurtje_notifications_read", { p_ids: ids });
  }

  globalThis.OveruurtjeShares = Object.freeze({
    createInvite,
    previewInvite,
    claimInvite,
    listReceived,
    listSent,
    listParticipants,
    accept,
    remove,
    listNotifications,
    markNotificationsRead
  });
})();
