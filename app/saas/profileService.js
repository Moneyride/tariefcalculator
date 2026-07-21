(function initializeProfileService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const PROFILE_COLUMNS = "id,email,created_at,updated_at,display_name,is_pro,subscription_status,subscription_provider";

  function normalize(row, user) {
    return {
      id: row?.id || user?.id || null,
      email: row?.email || user?.email || "",
      createdAt: row?.created_at || user?.created_at || null,
      displayName: row?.display_name || "",
      isPro: Boolean(row?.is_pro),
      subscriptionStatus: row?.subscription_status || "free",
      subscriptionProvider: row?.subscription_provider || "shopify"
    };
  }

  async function getForUser(user) {
    if (!user) return null;
    const client = await supabaseService.getClient();
    if (!client) return normalize(null, user);

    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();

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

  globalThis.OveruurtjeProfiles = Object.freeze({ getForUser });
})();
