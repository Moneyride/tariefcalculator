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
    clientName: row.client_name || "",
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
    clientName: row.client_name || "",
    optionalMessage: row.optional_message || "",
    shareMode: row.share_mode,
    available: row.available !== false
  });

  const normalizeProjectShare = (row) => ({
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name || "Een collega",
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    startDate: row.start_date,
    endDate: row.end_date,
    optionalMessage: row.optional_message || "",
    days: Array.isArray(row.days) ? row.days : [],
    acceptedAt: row.accepted_at,
    sourceUpdatedAt: row.source_updated_at
  });

  const normalizeProjectInvite = (row) => ({
    token: row.token,
    ownerName: row.owner_name || "Een collega",
    sourceType: "project",
    sourceId: row.project_id,
    projectId: row.project_id,
    projectName: row.project_name || "",
    clientName: row.client_name || "",
    startDate: row.start_date,
    endDate: row.end_date,
    optionalMessage: row.optional_message || "",
    days: Array.isArray(row.days) ? row.days : [],
    available: row.available !== false
  });

  async function createInvite({ sourceType, sourceId, message = "", shareMode = "direct" }) {
    if (sourceType === "project") {
      return rpc("create_project_share_invite", {
        p_project_id: sourceId,
        p_message: message
      });
    }
    return rpc("create_workday_share_invite", {
      p_source_type: sourceType,
      p_source_id: sourceId,
      p_message: message,
      p_share_mode: shareMode
    });
  }

  async function prepareWorkdaySource({
    id = null,
    name = "",
    workDate,
    calculationData = {}
  }) {
    return rpc("prepare_shared_workday_source", {
      p_workday_id: id,
      p_name: name,
      p_work_date: workDate,
      p_calculation_data: calculationData
    });
  }

  async function previewInvite(token, sourceType = "workday") {
    if (sourceType === "project") {
      const rows = await rpc("preview_project_share_invite", { p_token: token });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row ? normalizeProjectInvite(row) : null;
    }
    const rows = await rpc("preview_workday_share_invite", { p_token: token });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? normalizeInvite(row) : null;
  }

  async function claimInvite(token, sourceType = "workday") {
    if (sourceType === "project") {
      return rpc("claim_project_share_invite", { p_token: token });
    }
    return rpc("claim_workday_share_invite", { p_token: token });
  }

  async function listReceived() {
    return (await rpc("get_received_workday_shares") || []).map(normalizeReceived);
  }

  async function listReceivedProjects() {
    return (await rpc("get_received_project_shares") || []).map(normalizeProjectShare);
  }

  async function listSent(sourceType, sourceId) {
    if (sourceType === "project") {
      return (await rpc("get_sent_project_shares", { p_project_id: sourceId }) || [])
        .map(normalizeSent)
        .sort((a, b) => a.recipientName.localeCompare(b.recipientName, "nl"));
    }
    return (await rpc("get_sent_workday_shares", {
      p_source_type: sourceType,
      p_source_id: sourceId
    }) || [])
      .map(normalizeSent)
      .sort((a, b) => a.recipientName.localeCompare(b.recipientName, "nl"));
  }

  async function listParticipants(sourceType, sourceId) {
    const rows = sourceType === "project"
      ? await rpc("get_project_share_participants", { p_project_id: sourceId })
      : await rpc("get_workday_share_participants", {
          p_source_type: sourceType,
          p_source_id: sourceId
        });
    return (rows || []).map((row) => ({
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

  async function removeProjectShare(id) {
    await rpc("remove_project_share", { p_share_id: id });
  }

  async function listNotifications() {
    return (await rpc("list_overuurtje_notifications") || []).map(normalizeNotification);
  }

  async function markNotificationsRead(ids = null) {
    await rpc("mark_overuurtje_notifications_read", { p_ids: ids });
  }

  async function markShareNotificationsRead(shareId) {
    if (!shareId) return;
    const notificationIds = (await listNotifications())
      .filter((item) => item.shareId === shareId && !item.readAt)
      .map((item) => item.id);
    if (notificationIds.length) await markNotificationsRead(notificationIds);
  }

  globalThis.OveruurtjeShares = Object.freeze({
    prepareWorkdaySource,
    createInvite,
    previewInvite,
    claimInvite,
    listReceived,
    listReceivedProjects,
    listSent,
    listParticipants,
    accept,
    remove,
    removeProjectShare,
    listNotifications,
    markNotificationsRead,
    markShareNotificationsRead
  });
})();
