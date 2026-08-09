(function initializeProfileService() {
  "use strict";

  const supabaseService = globalThis.OveruurtjeSupabase;
  const LEGACY_PROFILE_COLUMNS = "id,email,created_at,updated_at,display_name,is_pro,subscription_status,subscription_provider";
  const SUBSCRIPTION_PROFILE_COLUMNS = `${LEGACY_PROFILE_COLUMNS},subscription_current_period_end,subscription_cancel_at_period_end`;
  const TRIAL_PROFILE_COLUMNS = `${SUBSCRIPTION_PROFILE_COLUMNS},trial_started_at,trial_ends_at,trial_reminder_sent_at,trial_expired_at,trial_expired_notice_shown_at,trial_converted_at`;
  const PROFILE_COLUMNS = `${TRIAL_PROFILE_COLUMNS},avatar_url`;

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
      subscriptionCancelAtPeriodEnd: Boolean(row?.subscription_cancel_at_period_end),
      trialStartedAt: row?.trial_started_at || null,
      trialEndsAt: row?.trial_ends_at || null,
      trialReminderSentAt: row?.trial_reminder_sent_at || null,
      trialExpiredAt: row?.trial_expired_at || null,
      trialExpiredNoticeShownAt: row?.trial_expired_notice_shown_at || null,
      trialConvertedAt: row?.trial_converted_at || null,
      avatarUrl: row?.avatar_url || ""
    };
  }

  function isMissingColumns(error, columns) {
    const message = `${error?.message || ""} ${error?.details || ""}`;
    return error?.code === "42703"
      || error?.code === "PGRST204"
      || columns.some((column) => message.includes(column));
  }

  function providerAvatarUrl(user) {
    const candidate = String(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  async function saveProviderAvatarIfMissing(client, user, profile) {
    const avatarUrl = providerAvatarUrl(user);
    if (!avatarUrl || profile?.avatar_url) return profile;

    const { data, error } = await client
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id)
      .select(PROFILE_COLUMNS)
      .single();

    // Importing an OAuth avatar is cosmetic. Missing migrations, storage/RLS
    // restrictions or a temporary API error must never hide the profile and
    // therefore accidentally remove Pro access.
    if (error) {
      console.warn("Profielfoto van loginprovider kon niet worden overgenomen.", error);
      return profile;
    }
    return data || profile;
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

    // Keep login working while a new deployment and migration roll out.
    if (error && isMissingColumns(error, ["avatar_url"])) {
      ({ data, error } = await selectProfile(client, user.id, TRIAL_PROFILE_COLUMNS));
    }
    if (error && isMissingColumns(error, ["trial_started_at", "trial_ends_at"])) {
      ({ data, error } = await selectProfile(client, user.id, SUBSCRIPTION_PROFILE_COLUMNS));
    }
    if (error && isMissingColumns(error, ["subscription_current_period_end", "subscription_cancel_at_period_end"])) {
      ({ data, error } = await selectProfile(client, user.id, LEGACY_PROFILE_COLUMNS));
    }

    if (error) throw error;
    if (data) {
      data = await saveProviderAvatarIfMissing(client, user, data);
      return normalize(data, user);
    }

    const { data: created, error: insertError } = await client
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select(PROFILE_COLUMNS)
      .single();

    if (insertError) throw insertError;
    const profile = await saveProviderAvatarIfMissing(client, user, created);
    return normalize(profile, user);
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

  async function markTrialExpiredNoticeShown(user) {
    if (!user) return null;
    const client = await supabaseService.getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("mark_trial_expired_notice_shown");
    if (error) throw error;
    return data || null;
  }

  async function uploadAvatar(user, file) {
    if (!user) throw new Error("Log eerst in.");
    if (!(file instanceof File)) throw new Error("Kies een afbeelding.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Gebruik een JPG, PNG of WebP-afbeelding.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Gebruik een afbeelding kleiner dan 2 MB.");
    const client = await supabaseService.getClient();
    if (!client) throw new Error("Supabase is niet beschikbaar.");
    const path = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await client.storage.from("crew-avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600"
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = client.storage.from("crew-avatars").getPublicUrl(path);
    const versionedUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    const { data, error } = await client
      .from("profiles")
      .update({ avatar_url: versionedUrl })
      .eq("id", user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    return normalize(data, user);
  }

  globalThis.OveruurtjeProfiles = Object.freeze({
    getForUser,
    saveDisplayName,
    uploadAvatar,
    markTrialExpiredNoticeShown
  });
})();
