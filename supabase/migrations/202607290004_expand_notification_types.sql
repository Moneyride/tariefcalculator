-- Notification types are created only by trusted database functions.
-- Keep this column extensible so new in-app and push notification types do
-- not require replacing a hard-coded CHECK constraint every time.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

comment on column public.notifications.notification_type is
  'Application-defined notification type created by trusted database functions.';
