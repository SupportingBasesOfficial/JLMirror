// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { BlindedZabbixClient, decryptTokenParts } from "@repo/zabbix";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Device Sync — sincroniza devices do Zabbix para public.devices
// Usa BullMQ com fila durável Redis — sobrevive a restarts e múltiplas réplicas

interface TenantConfig {
  tenant_id: string;
  zabbix_api_url: string;
  zabbix_encrypted_token: string;
  zabbix_token_iv: string;
  zabbix_token_tag: string;
}

const QUEUE_NAME = "device-sync";
const SYNC_INTERVAL_MS = 300_000;

export async function startDeviceSync(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "sync-all-tenants",
    { every: SYNC_INTERVAL_MS },
  );

  startWorker(QUEUE_NAME, async () => {
    try {
      await syncAllTenants();
    } catch (err) {
      console.error("[device-sync] Erro no sync:", err instanceof Error ? err.message : String(err));
    }
  });
}

export function stopDeviceSync(): void {
  // Workers e filas são fechados centralmente por stopAllQueues no lifecycle
  console.warn("[device-sync] Worker parado");
}

export async function syncAllTenants(): Promise<void> {
  const tenantsResult = await query<TenantConfig>(
    `SELECT t.id as tenant_id, tr.zabbix_api_url, tr.zabbix_encrypted_token, tr.zabbix_token_iv, tr.zabbix_token_tag
     FROM public.tenants t
     JOIN public.tenant_routes tr ON t.id = tr.tenant_id
     WHERE t.status = 'active'
       AND tr.zabbix_encrypted_token IS NOT NULL
       AND tr.zabbix_token_iv IS NOT NULL
       AND tr.zabbix_token_tag IS NOT NULL`,
    [],
  );

  if (tenantsResult.error || !tenantsResult.data?.rows.length) return;

  for (const tenant of tenantsResult.data.rows) {
    try {
      await syncTenantDevices(tenant);
    } catch (err) {
      console.error(`[device-sync] Erro tenant ${tenant.tenant_id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

export async function syncTenantDevices(tenant: TenantConfig): Promise<{ synced: number; total: number }> {
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

  const devices = await client.getDevices();

  let synced = 0;
  if (devices.length > 0) {
    const hostnames = devices.map((d) => d.name || d.host || `host-${d.hostid}`);
    const ips = devices.map((d) => d.interfaces?.[0]?.ip ?? "0.0.0.0");
    const statuses = devices.map((d) => (d.status === "0" ? "active" : "inactive"));
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
    }
  }

  console.warn(`[device-sync] Tenant ${tenant.tenant_id}: ${synced}/${devices.length} devices sincronizados`);
  return { synced, total: devices.length };
}
