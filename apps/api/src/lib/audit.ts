// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Wrapper centralizado para write_audit_log — elimina SQL inline em 40+ rotas

import { query } from "@repo/db";

interface AuditLogParams {
  userId: string;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  newData?: unknown;
  oldData?: unknown;
  metadata?: unknown;
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
}: AuditLogParams): Promise<void> {
  await query("SELECT public.write_audit_log($1, $2, $3, $4, $5, $6, $7, $8)", [
    userId,
    tenantId,
    action,
    entityType,
    entityId,
    newData ? JSON.stringify(newData) : null,
    oldData ? JSON.stringify(oldData) : null,
    metadata ? JSON.stringify(metadata) : null,
  ]);
}
