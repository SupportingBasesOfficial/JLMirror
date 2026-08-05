// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { BlindedZabbixClient, decryptTokenParts } from "@repo/zabbix";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Device Sync — sincroniza devices do Zabbix para public.devices
// Usa BullMQ com fila durável Redis — sobrevive a restarts e múltiplas réplicas
// Processa tenants em paralelo com limite de concorrência para não saturar pool PG

interface TenantConfig {
  tenant_id: string;
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
  zabbix_host_group_id: string;
}

const QUEUE_NAME = "device-sync";
const SYNC_INTERVAL_MS = 300_000;
const SYNC_CONCURRENCY = 10;

export async function startDeviceSync(): Promise<void> {
  await registerRepeatableJob(QUEUE_NAME, "sync-all-tenants", {
    every: SYNC_INTERVAL_MS,
  });

  startWorker(QUEUE_NAME, async () => {
    try {
      await syncAllTenants();
    } catch (err) {
      logger.error("Erro no device sync", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export function stopDeviceSync(): void {
  // Workers e filas são fechados centralmente por stopAllQueues no lifecycle
  logger.info("Device sync worker parado");
}

export async function syncAllTenants(): Promise<void> {
  const tenantsResult = await query<TenantConfig>(
    `SELECT t.id as tenant_id, tr.zabbix_api_url, tr.zabbix_encrypted_token, tr.zabbix_token_iv, tr.zabbix_token_tag, tr.zabbix_host_group_id
     FROM public.tenants t
     JOIN public.tenant_routes tr ON t.id = tr.tenant_id
     WHERE t.status = 'active'
       AND tr.zabbix_encrypted_token IS NOT NULL
       AND tr.zabbix_token_iv IS NOT NULL
       AND tr.zabbix_token_tag IS NOT NULL`,
    [],
  );

  if (tenantsResult.error || !tenantsResult.data?.rows.length) return;

  const tenants = tenantsResult.data.rows;
  const total = tenants.length;
  let completed = 0;
  let failed = 0;

  // Processa em chunks de SYNC_CONCURRENCY para não saturar pool PG nem API Zabbix
  for (let i = 0; i < total; i += SYNC_CONCURRENCY) {
    const chunk = tenants.slice(i, i + SYNC_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((tenant) => syncTenantDevices(tenant)),
    );

    for (let j = 0; j < results.length; j++) {
      completed++;
      const r = results[j];
      if (r.status === "rejected") {
        failed++;
        logger.error("Erro no sync do tenant", {
          tenantId: chunk[j].tenant_id,
          error:
            r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  }

  logger.info("Sync concluido", { completed, total, failed });
}

export async function syncTenantDevices(
  tenant: TenantConfig,
): Promise<{ synced: number; total: number }> {
  const apiToken = decryptTokenParts(
    tenant.zabbix_encrypted_token,
    tenant.zabbix_token_iv,
    tenant.zabbix_token_tag,
  );

  if (!apiToken) {
    return { synced: 0, total: 0 };
  }

  const client = new BlindedZabbixClient({
    apiUrl: tenant.zabbix_api_url,
    apiToken,
  });

  // Passa o host_group_id para filtrar apenas os hosts do grupo do tenant
  const devices = await client.getDevices(tenant.zabbix_host_group_id);

  let synced = 0;
  if (devices.length > 0) {
    const hostnames = devices.map(
      (d) => d.name || d.host || `host-${d.hostid}`,
    );
    const ips = devices.map((d) => d.interfaces?.[0]?.ip ?? "0.0.0.0");
    const statuses = devices.map((d) =>
      d.status === "0" ? "active" : "inactive",
    );
    const hostIds = devices.map((d) => d.hostid);

    const upsertResult = await query(
      `INSERT INTO public.devices (tenant_id, hostname, ip, type, status, zabbix_host_id)
       SELECT $1, hostname, ip, 'server', status, zabbix_host_id
       FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[]) AS t(hostname, ip, status, zabbix_host_id)
       ON CONFLICT (tenant_id, zabbix_host_id) WHERE zabbix_host_id IS NOT NULL
       DO UPDATE SET
         hostname = EXCLUDED.hostname,
         ip = EXCLUDED.ip,
         status = EXCLUDED.status,
         updated_at = timezone('utc'::text, now())`,
      [tenant.tenant_id, hostnames, ips, statuses, hostIds],
    );

    if (!upsertResult.error) {
      synced = devices.length;
      // Auto-cria assets a partir dos devices do Zabbix
      await syncAssetsFromDevices(tenant.tenant_id, devices);
    }
  }

  logger.info("Tenant sincronizado", {
    tenantId: tenant.tenant_id,
    synced,
    total: devices.length,
  });
  return { synced, total: devices.length };
}

// Auto-cria assets a partir dos devices do Zabbix
// Usa asset_tag = zabbix_host_id para evitar duplicatas (ON CONFLICT)
async function syncAssetsFromDevices(
  tenantId: string,
  devices: Array<{
    hostid: string;
    name?: string;
    host?: string;
    interfaces?: Array<{ ip?: string }>;
  }>,
): Promise<void> {
  try {
    const assetTags = devices.map((d) => `zbx-${d.hostid}`);
    const names = devices.map((d) => d.name || d.host || `host-${d.hostid}`);
    const hostnames = devices.map(
      (d) => d.host || d.name || `host-${d.hostid}`,
    );
    const ips = devices.map((d) => d.interfaces?.[0]?.ip ?? null);

    await query(
      `INSERT INTO public.assets (tenant_id, asset_tag, name, asset_type, category, status, criticality, hostname, ip_address)
       SELECT $1, asset_tag, name, 'server', 'hardware', 'active', 'medium', hostname, ip
       FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[]) AS t(asset_tag, name, hostname, ip)
       ON CONFLICT (tenant_id, asset_tag) DO UPDATE SET
         name = EXCLUDED.name,
         hostname = EXCLUDED.hostname,
         ip_address = EXCLUDED.ip_address,
         updated_at = timezone('utc'::text, now())`,
      [tenantId, assetTags, names, hostnames, ips],
    );

    logger.info("Assets sincronizados do Zabbix", {
      tenantId,
      count: devices.length,
    });
  } catch (err) {
    logger.error("Erro ao sincronizar assets do Zabbix", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
