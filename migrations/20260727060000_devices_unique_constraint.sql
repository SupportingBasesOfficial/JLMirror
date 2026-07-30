-- Migration: Adiciona constraint UNIQUE em tenant_template.devices para upsert do device-sync
-- Permite ON CONFLICT (tenant_id, zabbix_host_id) no sync de devices do Zabbix

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_zabbix_host
  ON tenant_template.devices (tenant_id, zabbix_host_id)
  WHERE zabbix_host_id IS NOT NULL;
