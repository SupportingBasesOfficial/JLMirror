// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Wrapper centralizado para write_audit_log — elimina SQL inline em 40+ rotas

import { query } from "@repo/db";

interface AuditLogParams {
  userId: string | null;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  newData?: unknown;
  oldData?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog({
  userId,
  tenantId = null,
  action,
  entityType,
  entityId = null,
  newData = null,
  oldData = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}: AuditLogParams): Promise<void> {
  // Funcao SQL: write_audit_log(user_id, tenant_id, action, resource_type, resource_id, details, ip_address, user_agent)
  // details = JSON com { new, old, metadata }
  const details =
    newData || oldData || metadata
      ? JSON.stringify({ new: newData, old: oldData, metadata })
      : null;

  await query("SELECT public.write_audit_log($1, $2, $3, $4, $5, $6, $7, $8)", [
    userId,
    tenantId,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
    userAgent,
  ]);
}
