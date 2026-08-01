-- @ai-context: .zero-error/architecture-map.md#state-store
-- @ai-restriction: .zero-error/code-standards.md#error-handling
-- Migration: Kubernetes monitoring — clusters, cache de recursos e eventos

CREATE TABLE IF NOT EXISTS public.k8s_clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  api_server_url TEXT NOT NULL,
  context TEXT,
  namespace TEXT DEFAULT 'default',
  kubeconfig_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  version TEXT,
  node_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_k8s_clusters_tenant ON public.k8s_clusters (tenant_id, is_active);

-- Cache de recursos K8s (pods, services, deployments, etc)
CREATE TABLE IF NOT EXISTS public.k8s_resources_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES public.k8s_clusters(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('pod','service','deployment','configmap','secret','node','namespace','daemonset','statefulset','ingress','pvc','job','cronjob')),
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  uid TEXT,
  status JSONB DEFAULT '{}'::jsonb,
  spec JSONB DEFAULT '{}'::jsonb,
  labels JSONB DEFAULT '{}'::jsonb,
  annotations JSONB DEFAULT '{}'::jsonb,
  ready TEXT,
  restarts INT DEFAULT 0,
  node_name TEXT,
  pod_ip TEXT,
  age_seconds INT,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_k8s_cache_cluster_type ON public.k8s_resources_cache (cluster_id, resource_type, namespace);
CREATE INDEX idx_k8s_cache_tenant ON public.k8s_resources_cache (tenant_id, cached_at DESC);
CREATE INDEX idx_k8s_cache_labels ON public.k8s_resources_cache USING GIN (labels);
CREATE UNIQUE INDEX idx_k8s_cache_unique ON public.k8s_resources_cache (cluster_id, resource_type, namespace, name);

-- Eventos K8s
CREATE TABLE IF NOT EXISTS public.k8s_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID NOT NULL REFERENCES public.k8s_clusters(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('Normal','Warning') OR type IS NULL),
  reason TEXT,
  message TEXT,
  involved_object_kind TEXT,
  involved_object_name TEXT,
  involved_object_namespace TEXT,
  source TEXT,
  first_timestamp TIMESTAMPTZ,
  last_timestamp TIMESTAMPTZ,
  count INT DEFAULT 1,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_k8s_events_cluster ON public.k8s_events (cluster_id, last_timestamp DESC);
CREATE INDEX idx_k8s_events_tenant ON public.k8s_events (tenant_id, last_timestamp DESC);
CREATE INDEX idx_k8s_events_namespace ON public.k8s_events (cluster_id, namespace, last_timestamp DESC);
CREATE INDEX idx_k8s_events_type ON public.k8s_events (type) WHERE type = 'Warning';

-- RLS
ALTER TABLE public.k8s_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k8s_resources_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.k8s_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY k8s_clusters_tenant_isolation ON public.k8s_clusters
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY k8s_clusters_global_admin ON public.k8s_clusters
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY k8s_cache_tenant_isolation ON public.k8s_resources_cache
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY k8s_cache_global_admin ON public.k8s_resources_cache
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

CREATE POLICY k8s_events_tenant_isolation ON public.k8s_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY k8s_events_global_admin ON public.k8s_events
  FOR ALL USING (current_setting('app.current_role', true) IN ('global_admin_role', 'app_runtime'));

-- Permissoes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_clusters TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_clusters TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_resources_cache TO app_login;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_resources_cache TO app_runtime;
GRANT SELECT, INSERT ON public.k8s_events TO app_login;
GRANT SELECT, INSERT ON public.k8s_events TO app_runtime;

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_k8s_clusters BEFORE UPDATE ON public.k8s_clusters
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Funcao para limpar cache expirado
CREATE OR REPLACE FUNCTION public.cleanup_k8s_cache(p_cluster_id UUID, p_max_age_hours INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.k8s_resources_cache
  WHERE cluster_id = p_cluster_id
    AND cached_at < timezone('utc'::text, now()) - (p_max_age_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
