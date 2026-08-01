-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Adicionar web_push como channel_type ===
-- Estende o CHECK constraint de notification_channels para incluir web_push

ALTER TABLE public.notification_channels DROP CONSTRAINT IF EXISTS notification_channels_channel_type_check;
ALTER TABLE public.notification_channels ADD CONSTRAINT notification_channels_channel_type_check
  CHECK (channel_type IN ('slack','email','webhook','teams','telegram','discord','pagerduty','web_push'));
