import {
  listExpiredSubscriptions,
  listPendingTrialReminderEmails,
  processTrialTransitions,
  updateProfile
} from "./lib/supabase-admin.mjs";
import { sendTrialReminder } from "./lib/trial-email.mjs";

export default async function handler() {
  const now = new Date().toISOString();
  const trialTransitions = await processTrialTransitions();
  const expired = await listExpiredSubscriptions(now);

  await Promise.all((expired || []).map((profile) => updateProfile(profile.id, {
    is_pro: false,
    subscription_status: "free",
    subscription_cancel_at_period_end: false,
    subscription_updated_at: now
  })));

  const pendingReminders = await listPendingTrialReminderEmails(now);
  const reminderResults = [];
  for (const profile of pendingReminders || []) {
    try {
      const result = await sendTrialReminder(profile);
      if (result.sent) {
        await updateProfile(profile.id, {
          trial_reminder_email_sent_at: now,
          trial_reminder_email_error: null,
          updated_at: now
        });
      }
      reminderResults.push({ id: profile.id, ...result });
    } catch (error) {
      await updateProfile(profile.id, {
        trial_reminder_email_error: String(error?.message || error).slice(0, 1000),
        updated_at: now
      });
      reminderResults.push({ id: profile.id, sent: false, skipped: false, error: error?.message || String(error) });
    }
  }

  return Response.json({
    expired: expired?.length || 0,
    trialTransitions,
    trialReminders: {
      pending: pendingReminders?.length || 0,
      sent: reminderResults.filter((result) => result.sent).length,
      skipped: reminderResults.filter((result) => result.skipped).length,
      failed: reminderResults.filter((result) => result.error && !result.skipped).length
    }
  });
}

export const config = {
  schedule: "15 3 * * *"
};
