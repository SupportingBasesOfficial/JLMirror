-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- === Migration: Native Push Support (APNs/FCM) ===
-- Adiciona suporte a push notifications nativo (Expo/APNs/FCM)
-- alongside the existing Web Push (VAPID) subscriptions.

-- Torna as colunas VAPID nullable (push nativo nao tem essas keys)
ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh_key DROP NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN auth_key DROP NOT NULL;

-- Adiciona colunas para push nativo
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS platform VARCHAR(10) CHECK (platform IN ('ios', 'android', 'web'));

-- Index para buscar por push_token
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_push_token
  ON public.push_subscriptions(push_token) WHERE push_token IS NOT NULL;

-- Unique constraint para push_token + user_id (evita duplicatas nativas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_native
  ON public.push_subscriptions(push_token, user_id)
  WHERE push_token IS NOT NULL;
