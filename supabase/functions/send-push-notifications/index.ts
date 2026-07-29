import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

type Delivery = {
  delivery_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notification_id: string;
  notification_type: string;
  share_id: string | null;
  source_type: string | null;
  source_id: string | null;
  actor_name: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const publicSiteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://overuurtje.nl").replace(/\/$/, "");
const cronSecret = Deno.env.get("PUSH_CRON_SECRET") || "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:info@thegearharbor.com";

const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function notificationCopy(delivery: Delivery) {
  const actor = delivery.actor_name || "Een collega";
  const copies: Record<string, { title: string; body: string }> = {
    workday_start_owner: {
      title: "Je werkdag begint",
      body: "Je vooraf ingestelde werkdag begint nu."
    },
    workday_started: {
      title: "Gedeelde werkdag gestart",
      body: `${actor} begint nu aan de gedeelde werkdag.`
    },
    workday_completed: {
      title: "Eindtijd vastgelegd",
      body: `${actor} heeft de eindtijd van de gedeelde werkdag vastgelegd.`
    },
    workday_times_updated: {
      title: "Werktijden gewijzigd",
      body: `${actor} heeft de gedeelde werktijden aangepast.`
    },
    workday_share_removed: {
      title: "Werkdag niet meer gedeeld",
      body: "Een gedeelde werkdag is niet langer beschikbaar."
    }
  };
  return copies[delivery.notification_type] || {
    title: "Nieuwe melding",
    body: `${actor} heeft iets met je gedeeld in Overuurtje.`
  };
}

function notificationUrl(delivery: Delivery) {
  if (delivery.share_id) {
    return `${publicSiteUrl}/workdays.html?shared=${encodeURIComponent(delivery.share_id)}`;
  }
  if (delivery.source_type === "workday" && delivery.source_id) {
    return `${publicSiteUrl}/index.html?workday=${encodeURIComponent(delivery.source_id)}`;
  }
  if (delivery.source_type === "project_day") {
    return `${publicSiteUrl}/projects.html`;
  }
  return `${publicSiteUrl}/index.html`;
}

async function updateDelivery(
  deliveryId: string,
  values: Record<string, string | number | null>
) {
  const { error } = await database
    .from("push_deliveries")
    .update(values)
    .eq("id", deliveryId);
  if (error) console.error("Pushstatus kon niet worden bijgewerkt.", error);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!cronSecret || request.headers.get("x-overuurtje-push-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: "Push secrets ontbreken." }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // This preserves the existing rule that only workdays saved before their
  // start generate a start notification. The SQL function is idempotent.
  const dispatchResult = await database.rpc("dispatch_workday_start_notifications");
  if (dispatchResult.error) {
    console.error("Werkdagstartmeldingen konden niet worden klaargezet.", dispatchResult.error);
  }

  const claimResult = await database.rpc("claim_push_deliveries", { p_limit: 100 });
  if (claimResult.error) {
    return Response.json({ error: claimResult.error.message }, { status: 500 });
  }

  const deliveries = (claimResult.data || []) as Delivery[];
  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const copy = notificationCopy(delivery);
    const payload = JSON.stringify({
      ...copy,
      url: notificationUrl(delivery),
      tag: `overuurtje-${delivery.notification_id}`,
      notificationId: delivery.notification_id,
      renotify: delivery.notification_type === "workday_times_updated"
    });

    try {
      await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth }
      }, payload, { TTL: 3600 });
      await updateDelivery(delivery.delivery_id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null
      });
      sent += 1;
    } catch (error) {
      const pushError = error as { statusCode?: number; message?: string };
      const statusCode = Number(pushError.statusCode || 0);
      const message = String(pushError.message || "Onbekende Web Push-fout").slice(0, 1000);
      if (statusCode === 404 || statusCode === 410) {
        await database.from("push_subscriptions").delete().eq("id", delivery.subscription_id);
      } else {
        await updateDelivery(delivery.delivery_id, {
          status: "failed",
          next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          last_error: message
        });
      }
      failed += 1;
    }
  }

  return Response.json({
    queued: deliveries.length,
    sent,
    failed,
    workdayNotificationsCreated: dispatchResult.data || 0
  });
});
