const DEFAULT_UPGRADE_URL = "https://thegearharbor.com/products/overuurtje-pro-digitaal-abonnement";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function trialReminderMessage(profile) {
  const endDate = new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(profile.trial_ends_at));
  const name = String(profile.display_name || "").trim().split(/\s+/)[0];
  const greeting = name ? `Hoi ${escapeHtml(name)},` : "Hoi,";
  const upgradeUrl = process.env.SHOPIFY_CHECKOUT_URL || DEFAULT_UPGRADE_URL;

  return {
    from: "Overuurtje.nl <info@thegearharbor.com>",
    to: [profile.email],
    subject: "Je gratis Pro-periode eindigt over 7 dagen",
    html: `<!doctype html>
      <html lang="nl"><body style="margin:0;background:#f4f5f2;color:#173f36;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f2;padding:28px 12px;"><tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e8eaed;border-radius:20px;overflow:hidden;">
            <tr><td style="padding:30px 34px 18px;"><strong style="font-size:25px;">Over<span style="color:#ff6a1a;">uurtje</span>.nl</strong><div style="margin-top:5px;color:#6b7280;font-size:13px;">reken, check, klaar.</div></td></tr>
            <tr><td style="padding:14px 34px 34px;line-height:1.65;color:#374151;">
              <p>${greeting}</p>
              <h1 style="margin:12px 0 16px;color:#173f36;font-size:28px;line-height:1.25;">Je gratis Pro-periode eindigt over 7 dagen</h1>
              <p>Je kunt Overuurtje Pro nog gebruiken tot en met <strong>${escapeHtml(endDate)}</strong>. Daarna gaat je account automatisch terug naar Free.</p>
              <p>Je opgeslagen werkdagen, projecten, apparatuur en instellingen blijven bewaard. Alleen de bestaande Pro-functies worden weer vergrendeld.</p>
              <p style="margin:28px 0;"><a href="${escapeHtml(upgradeUrl)}" style="display:inline-block;background:#ff6a1a;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:12px;">Upgrade naar Pro</a></p>
              <p style="color:#6b7280;font-size:13px;">Er wordt niets automatisch afgeschreven. Je hoeft niets te doen wanneer je verder wilt met Free.</p>
            </td></tr>
            <tr><td style="padding:20px 34px;border-top:1px solid #e8eaed;color:#6b7280;font-size:12px;">Overuurtje.nl is een dienst van The GearHarbor.</td></tr>
          </table>
        </td></tr></table>
      </body></html>`
  };
}

export async function sendTrialReminder(profile, fetchImpl = fetch) {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) return { sent: false, skipped: true, error: "RESEND_API_KEY ontbreekt." };

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(trialReminderMessage(profile))
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Resend ${response.status}: ${text || response.statusText}`);
  return { sent: true, skipped: false };
}
