// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { cachedQuery } from "@repo/cache";

// Algoritmo de Health Score — agrega múltiplas dimensões num score 0-100
// Dimensões e pesos:
//   1. Uptime de dispositivos (25%)
//   2. Backups bem-sucedidos (20%)
//   3. Certificados SSL válidos (15%)
//   4. Health checks saudáveis (15%)
//   5. Tickets críticos abertos (10%)
//   6. Incidents ativos (10%)
//   7. Compliance scans aprovados (5%)
//
// Cada dimensão retorna um sub-score 0-100.
// O score final é a média ponderada.

export interface HealthScoreBreakdown {
  dimension: string;
  label: string;
  score: number;
  weight: number;
  details: Record<string, unknown>;
}

export interface HealthScoreResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  status: "excellent" | "good" | "fair" | "poor" | "critical";
  breakdown: HealthScoreBreakdown[];
  calculated_at: string;
  tenant_id: string | null;
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreToStatus(score: number): "excellent" | "good" | "fair" | "poor" | "critical" {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  if (score >= 40) return "poor";
  return "critical";
}

function safeCount(result: { data?: { rows?: Array<Record<string, unknown>> } | null }): number {
  const row = result.data?.rows?.[0];
  if (!row) return 0;
  return parseInt((row.count as string) ?? "0", 10);
}

export async function calculateHealthScore(tenantId: string | null): Promise<HealthScoreResult> {
  const cacheKey = `health-score:${tenantId ?? "global"}`;
  const ttlSeconds = 60;

  return cachedQuery<HealthScoreResult>(
    cacheKey,
    async () => {
      const breakdown: HealthScoreBreakdown[] = [];

      // 1. Uptime de dispositivos (25%)
      const totalDevices = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
        [tenantId],
      ));
      const activeDevices = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      ));
      const deviceUptimePct = totalDevices > 0 ? (activeDevices / totalDevices) * 100 : 100;
      breakdown.push({
        dimension: "device_uptime",
        label: "Uptime de Dispositivos",
        score: Math.round(deviceUptimePct * 100) / 100,
        weight: 0.25,
        details: { total: totalDevices, active: activeDevices, inactive: totalDevices - activeDevices },
      });

      // 2. Backups bem-sucedidos (20%)
      const totalBackups = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1",
        [tenantId],
      ));
      const successfulBackups = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1 AND status IN ('completed','verified')",
        [tenantId],
      ));
      const backupScore = totalBackups > 0 ? (successfulBackups / totalBackups) * 100 : 100;
      breakdown.push({
        dimension: "backups",
        label: "Backups",
        score: Math.round(backupScore * 100) / 100,
        weight: 0.20,
        details: { total: totalBackups, successful: successfulBackups, failed: totalBackups - successfulBackups },
      });

      // 3. Certificados SSL válidos (15%)
      const totalSsl = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1",
        [tenantId],
      ));
      const validSsl = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status = 'valid'",
        [tenantId],
      ));
      const sslScore = totalSsl > 0 ? (validSsl / totalSsl) * 100 : 100;
      breakdown.push({
        dimension: "ssl_certs",
        label: "Certificados SSL",
        score: Math.round(sslScore * 100) / 100,
        weight: 0.15,
        details: { total: totalSsl, valid: validSsl, expired_or_expiring: totalSsl - validSsl },
      });

      // 4. Health checks saudáveis (15%)
      const totalChecks = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.system_health_checks WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      ));
      const healthyChecks = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.system_health_checks WHERE tenant_id = $1 AND is_active = true AND last_status = 'healthy'",
        [tenantId],
      ));
      const checksScore = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 100;
      breakdown.push({
        dimension: "health_checks",
        label: "Health Checks",
        score: Math.round(checksScore * 100) / 100,
        weight: 0.15,
        details: { total: totalChecks, healthy: healthyChecks, unhealthy: totalChecks - healthyChecks },
      });

      // 5. Tickets críticos abertos (10%) — quanto menos críticos, maior o score
      const criticalTickets = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')",
        [tenantId],
      ));
      const ticketScore = Math.max(0, 100 - criticalTickets * 10);
      breakdown.push({
        dimension: "critical_tickets",
        label: "Tickets Críticos",
        score: ticketScore,
        weight: 0.10,
        details: { open_critical: criticalTickets },
      });

      // 6. Incidents ativos (10%) — quanto mais incidents ativos, menor o score
      const activeIncidents = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.system_incidents WHERE tenant_id = $1 AND status NOT IN ('resolved')",
        [tenantId],
      ));
      const criticalIncidents = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.system_incidents WHERE tenant_id = $1 AND status NOT IN ('resolved') AND severity = 'critical'",
        [tenantId],
      ));
      const incidentPenalty = criticalIncidents * 20 + (activeIncidents - criticalIncidents) * 5;
      const incidentScore = Math.max(0, 100 - incidentPenalty);
      breakdown.push({
        dimension: "incidents",
        label: "Incidentes Ativos",
        score: incidentScore,
        weight: 0.10,
        details: { active: activeIncidents, critical: criticalIncidents },
      });

      // 7. Compliance scans aprovados (5%)
      const totalScans = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.compliance_scans WHERE tenant_id = $1",
        [tenantId],
      ));
      const passedScans = safeCount(await query(
        "SELECT COUNT(*) as count FROM public.compliance_scans WHERE tenant_id = $1 AND status = 'passed'",
        [tenantId],
      ));
      const complianceScore = totalScans > 0 ? (passedScans / totalScans) * 100 : 100;
      breakdown.push({
        dimension: "compliance",
        label: "Compliance",
        score: Math.round(complianceScore * 100) / 100,
        weight: 0.05,
        details: { total: totalScans, passed: passedScans, failed: totalScans - passedScans },
      });

      // Score final = média ponderada
      const finalScore = Math.round(
        breakdown.reduce((acc, b) => acc + b.score * b.weight, 0),
      );

      return {
        score: finalScore,
        grade: scoreToGrade(finalScore),
        status: scoreToStatus(finalScore),
        breakdown,
        calculated_at: new Date().toISOString(),
        tenant_id: tenantId,
      };
    },
    ttlSeconds,
  );
}
