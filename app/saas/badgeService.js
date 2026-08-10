(function initializeBadgeService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;

  async function client() {
    const value = await supabaseService?.getClient?.();
    if (!value) throw new Error("Supabase is niet beschikbaar.");
    return value;
  }

  async function rpc(name, values = {}) {
    const db = await client();
    const { data, error } = await db.rpc(name, values);
    if (error) throw error;
    return data;
  }

  function normalizeAwards(data) {
    return (Array.isArray(data) ? data : []).map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      icon: item.icon,
      earnedAt: item.earned_at
    }));
  }

  function publishAwards(awards) {
    if (!awards.length) return awards;
    document.dispatchEvent(new CustomEvent("overuurtje:badges-earned", {
      detail: { awards }
    }));
    return awards;
  }

  async function evaluate() {
    return publishAwards(normalizeAwards(await rpc("evaluate_my_badges")));
  }

  async function track(eventKey, sourceId = null, metadata = {}) {
    return publishAwards(normalizeAwards(await rpc("record_badge_activity", {
      p_event_key: eventKey,
      p_source_id: sourceId,
      p_metadata: metadata
    })));
  }

  async function getCrewCard() {
    const value = await rpc("get_my_crew_card");
    if (!value) return null;
    return {
      displayName: value.displayName ?? value.display_name ?? "Crewlid",
      avatarUrl: value.avatarUrl ?? value.avatar_url ?? "",
      registeredWorkdays: Number(value.registeredWorkdays ?? value.registered_workdays) || 0,
      badgeCount: Number(value.badgeCount ?? value.badge_count) || 0,
      crewCount: Number(value.crewCount ?? value.crew_count) || 0,
      jointWorkdays: Number(value.jointWorkdays ?? value.joint_workdays) || 0,
      memberSince: value.memberSince ?? value.member_since ?? "",
      selectedBadge: value.selectedBadge ?? value.selected_badge ?? null,
      featuredBadges: value.featuredBadges ?? value.featured_badges ?? []
    };
  }

  async function list() {
    return (await rpc("list_my_badges") || []).map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      icon: item.icon,
      hidden: Boolean(item.hidden),
      earnedAt: item.earned_at,
      featured: Boolean(item.is_featured ?? item.is_selected),
      featuredPosition: Number(item.featured_position) || null,
      title: Boolean(item.is_title ?? item.is_selected)
    }));
  }

  async function saveSelection(keys, titleKey) {
    await rpc("set_my_crew_badges", {
      p_badge_keys: Array.from(new Set(keys || [])).slice(0, 3),
      p_title_badge_key: titleKey || null
    });
  }

  async function getCrewMember(userId) {
    return await rpc("get_crew_member_card", { p_user_id: userId });
  }

  globalThis.OveruurtjeBadges = Object.freeze({ evaluate, track, getCrewCard, getCrewMember, list, saveSelection });
})();
