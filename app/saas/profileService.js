(function initializeProfileService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const LEGACY_PROFILE_COLUMNS = "id,email,created_at,updated_at,display_name,is_pro,subscription_status,subscription_provider";
  const PROFILE_COLUMNS = `${LEGACY_PROFILE_COLUMNS},subscription_current_period_end,subscription_cancel_at_period_end`;

  function normalize(row, user) {
    return {
      id: row?.id || user?.id || null,
      email: row?.email || user?.email || "",
      createdAt: row?.created_at || user?.created_at || null,
      displayName: row?.display_name || "",
      isPro: Boolean(row?.is_pro),
      subscriptionStatus: row?.subscription_status || "free",
      subscriptionProvider: row?.subscription_provider || "shopify",
      subscriptionCurrentPeriodEnd: row?.subscription_current_period_end || null,
      subscriptionCancelAtPeriodEnd: Boolean(row?.subscription_cancel_at_period_end)
    };
  }

  function isMissingSubscriptionColumns(error) {
    const message = `${error?.message || ""} ${error?.details || ""}`;
    return error?.code === "42703"
      || error?.code === "PGRST204"
      || message.includes("subscription_current_period_end")
      || message.includes("subscription_cancel_at_period_end");
  }

  async function selectProfile(client, userId, columns) {
    return client
      .from("profiles")
      .select(columns)
      .eq("id", userId)
      .maybeSingle();
  }

  async function getForUser(user) {
    if (!user) return null;
    const client = await supabaseService.getClient();
    if (!client) return normalize(null, user);

    let { data, error } = await selectProfile(client, user.id, PROFILE_COLUMNS);

    // Keep login working until the new migration has been applied.
    if (error && isMissingSubscriptionColumns(error)) {
      ({ data, error } = await selectProfile(client, user.id, LEGACY_PROFILE_COLUMNS));
    }

    if (error) throw error;
    if (data) return normalize(data, user);

    const { data: created, error: insertError } = await client
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select(PROFILE_COLUMNS)
      .single();

    if (insertError) throw insertError;
    return normalize(created, user);
  }

  async function saveDisplayName(user, displayName) {
    if (!user) throw new Error("Log eerst in.");
    const value = String(displayName || "").trim();
    if (!value) throw new Error("Vul je naam in.");
    if (value.length > 80) throw new Error("Gebruik maximaal 80 tekens.");
    const client = await supabaseService.getClient();
    if (!client) throw new Error("Supabase is niet beschikbaar.");
    const { data, error } = await client
      .from("profiles")
      .update({ display_name: value })
      .eq("id", user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data, user);
  }

  globalThis.OveruurtjeProfiles = Object.freeze({ getForUser, saveDisplayName });
})();
