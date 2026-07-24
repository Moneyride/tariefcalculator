import {
  listExpiredSubscriptions,
  updateProfile
} from "./lib/supabase-admin.mjs";

export default async function handler() {
  const now = new Date().toISOString();
  const expired = await listExpiredSubscriptions(now);

  await Promise.all((expired || []).map((profile) => updateProfile(profile.id, {
    is_pro: false,
    subscription_status: "free",
    subscription_cancel_at_period_end: false,
    subscription_updated_at: now
  })));

  return Response.json({ expired: expired?.length || 0 });
}

export const config = {
  schedule: "15 3 * * *"
};

