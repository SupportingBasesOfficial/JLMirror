// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeCount, safeRows } from "../lib/query-helpers.js";
import "../types.js";

export const executiveDashboardRoute = new Hono();

executiveDashboardRoute.use(
  "/*",
  requirePermission("dashboard:executive:read"),
);

// ========== Executive Overview ==========

executiveDashboardRoute.get("/overview", httpCache(60), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Devices — tabela em public.devices com RLS, status 'active' (não 'online')
  const totalDevices = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
      [tenantId],
    ),
  );
  const onlineDevices = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'active'",
      [tenantId],
    ),
  );
  const offlineDevices = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'inactive'",
      [tenantId],
    ),
  );
  const warningDevices = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'warning'",
      [tenantId],
    ),
  );
  const uptimePct =
    totalDevices > 0
      ? Math.round((onlineDevices / totalDevices) * 100 * 100) / 100
      : 100;

  // Tickets — tabela é public.tickets (não support_tickets)
  const totalTickets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1",
      [tenantId],
    ),
  );
  const openTickets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status IN ('open','in_progress','waiting_customer')",
      [tenantId],
    ),
  );
  const resolvedTickets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status = 'resolved'",
      [tenantId],
    ),
  );
  const criticalTickets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')",
      [tenantId],
    ),
  );
  const ticketResolutionRate =
    totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

  // Assets
  const totalAssets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.assets WHERE tenant_id = $1",
      [tenantId],
    ),
  );
  const activeAssets = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.assets WHERE tenant_id = $1 AND status = 'active'",
      [tenantId],
    ),
  );

  // Compliance — usa compliance_scans (total_checks/passed_checks)
  const complianceScansResult = await query(
    `SELECT COALESCE(SUM(total_checks), 0) as total, COALESCE(SUM(passed_checks), 0) as passed, COALESCE(SUM(failed_checks), 0) as failed
     FROM public.compliance_scans WHERE tenant_id = $1 AND status = 'completed'`,
    [tenantId],
  );
  const complianceRow = complianceScansResult.data?.rows?.[0] ?? {
    total: "0",
    passed: "0",
    failed: "0",
  };
  const totalControls = parseInt(String(complianceRow.total ?? "0"), 10);
  const passedControls = parseInt(String(complianceRow.passed ?? "0"), 10);
  const failedControls = parseInt(String(complianceRow.failed ?? "0"), 10);
  const complianceScore =
    totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 0;

  // Capacity
  const capacityAlerts = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.capacity_forecasts WHERE tenant_id = $1 AND confidence IN ('high','medium')",
      [tenantId],
    ),
  );

  // SSL — usa view ssl_certificates_with_status para status calculado
  const sslExpiring = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status = 'expiring_soon'",
      [tenantId],
    ),
  );
  const sslExpired = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status = 'expired'",
      [tenantId],
    ),
  );

  // Firewall
  const firewallRules = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
  );

  // Backups — tabela é public.backup_snapshots (não backups)
  const totalBackups = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1",
      [tenantId],
    ),
  );
  const successfulBackups = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1 AND status IN ('completed','verified')",
      [tenantId],
    ),
  );

  // KB
  const kbArticles = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.kb_articles WHERE tenant_id = $1 AND status = 'published'",
      [tenantId],
    ),
  );

  // Scheduled Tasks
  const activeTasks = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.scheduled_tasks WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
  );

  // API Keys
  const activeApiKeys = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.api_keys WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
  );

  // Webhooks
  const activeWebhooks = safeCount(
    await query(
      "SELECT COUNT(*) as count FROM public.webhooks WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
  );

  // Notifications — tabela é public.notification_log, sem is_read; conta enviadas nas últimas 24h
  const unreadNotifications = safeCount(
    await query(
      `SELECT COUNT(*) as count FROM public.notification_log
     WHERE tenant_id = $1 AND status = 'sent' AND created_at > timezone('utc'::text, now()) - INTERVAL '24 hours'`,
      [tenantId],
    ),
  );

  // System Health
  const healthChecks = safeRows(
    await query(
      "SELECT COUNT(*) as count, severity FROM public.system_health_checks WHERE tenant_id = $1 GROUP BY severity",
      [tenantId],
    ),
  );
  const criticalHealth = healthChecks.find((r) => r.severity === "critical")
    ? parseInt(
        (healthChecks.find((r) => r.severity === "critical")
          ?.count as string) ?? "0",
        10,
      )
    : 0;

  return c.json({
    availability: {
      total_devices: totalDevices,
      online: onlineDevices,
      offline: offlineDevices,
      warning: warningDevices,
      uptime_pct: uptimePct,
    },
    tickets: {
      total: totalTickets,
      open: openTickets,
      resolved: resolvedTickets,
      critical: criticalTickets,
      resolution_rate: ticketResolutionRate,
    },
    assets: {
      total: totalAssets,
      active: activeAssets,
    },
    compliance: {
      total_controls: totalControls,
      passed: passedControls,
      failed: failedControls,
      score: complianceScore,
    },
    infrastructure: {
      capacity_alerts: capacityAlerts,
      ssl_expiring: sslExpiring,
      ssl_expired: sslExpired,
      firewall_rules: firewallRules,
      backups_total: totalBackups,
      backups_successful: successfulBackups,
      backup_success_rate:
        totalBackups > 0
          ? Math.round((successfulBackups / totalBackups) * 100)
          : 0,
    },
    platform: {
      kb_articles: kbArticles,
      active_tasks: activeTasks,
      active_api_keys: activeApiKeys,
      active_webhooks: activeWebhooks,
      unread_notifications: unreadNotifications,
      critical_health_checks: criticalHealth,
    },
  });
});

// ========== Trends (last 7 days) ==========

executiveDashboardRoute.get("/trends", httpCache(120), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Ticket trends (last 7 days) — tabela é public.tickets
  const ticketTrends = safeRows(
    await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count,
       COUNT(*) FILTER (WHERE status = 'resolved') as resolved
     FROM public.tickets WHERE tenant_id = $1
       AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
     GROUP BY DATE(created_at) ORDER BY date`,
      [tenantId],
    ),
  );

  // Device status trends (current snapshot by status) — public.devices
  const deviceStatusBreakdown = safeRows(
    await query(
      `SELECT status, COUNT(*) as count FROM public.devices WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    ),
  );

  // Backup trends (last 7 days) — public.backup_snapshots
  const backupTrends = safeRows(
    await query(
      `SELECT DATE(created_at) as date, COUNT(*) as total,
       COUNT(*) FILTER (WHERE status IN ('completed','verified')) as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed
     FROM public.backup_snapshots WHERE tenant_id = $1
       AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
     GROUP BY DATE(created_at) ORDER BY date`,
      [tenantId],
    ),
  );

  // Notification trends (last 7 days) — public.notification_log
  const notificationTrends = safeRows(
    await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count,
       COUNT(*) FILTER (WHERE severity = 'critical') as critical
     FROM public.notification_log WHERE tenant_id = $1
       AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
     GROUP BY DATE(created_at) ORDER BY date`,
      [tenantId],
    ),
  );

  // Audit log activity (last 7 days) — public.audit_log
  const auditTrends = safeRows(
    await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM public.audit_log WHERE tenant_id = $1
       AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
     GROUP BY DATE(created_at) ORDER BY date`,
      [tenantId],
    ),
  );

  return c.json({
    tickets: ticketTrends,
    devices: deviceStatusBreakdown,
    backups: backupTrends,
    notifications: notificationTrends,
    audit: auditTrends,
  });
});

// ========== Alerts Summary ==========

executiveDashboardRoute.get("/alerts", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Critical tickets — tabela é public.tickets, prioridade 'urgent'
  const criticalTickets = safeRows(
    await query(
      `SELECT id, subject, priority, status, created_at FROM public.tickets
     WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')
     ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  // SSL expiring soon — usa view, coluna hostname (não domain_name)
  const sslAlerts = safeRows(
    await query(
      `SELECT id, hostname, status, valid_to FROM public.ssl_certificates_with_status
     WHERE tenant_id = $1 AND status IN ('expiring_soon', 'expired')
     ORDER BY valid_to ASC LIMIT 5`,
      [tenantId],
    ),
  );

  // Capacity risks
  const capacityRisks = safeRows(
    await query(
      `SELECT id, resource_name, resource_type, confidence, generated_at FROM public.capacity_forecasts
     WHERE tenant_id = $1 AND confidence IN ('high', 'medium')
     ORDER BY generated_at ASC LIMIT 5`,
      [tenantId],
    ),
  );

  // Failed backups — public.backup_snapshots
  const failedBackups = safeRows(
    await query(
      `SELECT id, file_path, status, error_message, created_at FROM public.backup_snapshots
     WHERE tenant_id = $1 AND status = 'failed'
     ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  // Critical health checks
  const healthAlerts = safeRows(
    await query(
      `SELECT id, check_name, severity, message, last_check_at FROM public.system_health_checks
     WHERE tenant_id = $1 AND severity IN ('critical', 'warning')
     ORDER BY last_check_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  const totalAlerts =
    criticalTickets.length +
    sslAlerts.length +
    capacityRisks.length +
    failedBackups.length +
    healthAlerts.length;

  return c.json({
    total_alerts: totalAlerts,
    critical_tickets: criticalTickets,
    ssl_alerts: sslAlerts,
    capacity_risks: capacityRisks,
    failed_backups: failedBackups,
    health_alerts: healthAlerts,
  });
});

// ========== Summary Cards ==========

executiveDashboardRoute.get("/summary", httpCache(60), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Top 5 device status — public.devices
  const topDevices = safeRows(
    await query(
      `SELECT hostname, status, ip, updated_at FROM public.devices
     WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  // Recent activity (audit log last 10) — public.audit_log
  const recentActivity = safeRows(
    await query(
      `SELECT action, entity_type, entity_id, created_at FROM public.audit_log
     WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [tenantId],
    ),
  );

  // Recent tickets — public.tickets
  const recentTickets = safeRows(
    await query(
      `SELECT id, subject, priority, status, created_at FROM public.tickets
     WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  // Recent backups — public.backup_snapshots
  const recentBackups = safeRows(
    await query(
      `SELECT id, file_path, status, created_at FROM public.backup_snapshots
     WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    ),
  );

  return c.json({
    top_devices: topDevices,
    recent_activity: recentActivity,
    recent_tickets: recentTickets,
    recent_backups: recentBackups,
  });
});
