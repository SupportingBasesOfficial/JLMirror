// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeCount, safeRows } from "../lib/query-helpers.js";
import "../types.js";

export const executiveDashboardRoute = new Hono();

executiveDashboardRoute.use(
  "/*",
  requirePermission("dashboard:executive:read"),
);

// GET /api/v1/dashboard/executive — overview do modulo
executiveDashboardRoute.get("/", async (c) => {
  return c.json({
    overview: "Executive Dashboard — Visão executiva",
    endpoints: ["/overview", "/trends", "/alerts", "/summary"],
  });
});

// ========== Executive Overview ==========

executiveDashboardRoute.get("/overview", httpCache(60), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const startedAt = Date.now();

  try {
    // Devices, Tickets, Assets, Compliance, Capacity, SSL, Firewall,
    // Backups, KB, Tasks, API Keys, Webhooks, Notifications, Health
    // Todas as queries executadas em paralelo via Promise.all
    const [
      totalDevicesR,
      onlineDevicesR,
      offlineDevicesR,
      warningDevicesR,
      totalTicketsR,
      openTicketsR,
      resolvedTicketsR,
      criticalTicketsR,
      totalAssetsR,
      activeAssetsR,
      complianceScansR,
      capacityAlertsR,
      sslExpiringR,
      sslExpiredR,
      firewallRulesR,
      totalBackupsR,
      successfulBackupsR,
      kbArticlesR,
      activeTasksR,
      activeApiKeysR,
      activeWebhooksR,
      unreadNotificationsR,
      healthChecksR,
    ] = await Promise.all([
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'inactive'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'warning'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status IN ('open','in_progress','waiting_customer')",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status = 'resolved'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.assets WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.assets WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      ),
      query(
        `SELECT COALESCE(SUM(total_checks), 0) as total, COALESCE(SUM(passed_checks), 0) as passed, COALESCE(SUM(failed_checks), 0) as failed
         FROM public.compliance_scans WHERE tenant_id = $1 AND status = 'completed'`,
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.capacity_forecasts WHERE tenant_id = $1 AND confidence IN ('high','medium')",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status = 'expiring_soon'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.ssl_certificates_with_status WHERE tenant_id = $1 AND status = 'expired'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.backup_snapshots WHERE tenant_id = $1 AND status IN ('completed','verified')",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.kb_articles WHERE tenant_id = $1 AND status = 'published'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.scheduled_tasks WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.api_keys WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.webhooks WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      ),
      query(
        `SELECT COUNT(*) as count FROM public.notification_log
         WHERE tenant_id = $1 AND status = 'sent' AND created_at > timezone('utc'::text, now()) - INTERVAL '24 hours'`,
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count, severity FROM public.system_health_checks WHERE tenant_id = $1 GROUP BY severity",
        [tenantId],
      ),
    ]);

    const totalDevices = safeCount(totalDevicesR);
    const onlineDevices = safeCount(onlineDevicesR);
    const offlineDevices = safeCount(offlineDevicesR);
    const warningDevices = safeCount(warningDevicesR);
    const uptimePct =
      totalDevices > 0
        ? Math.round((onlineDevices / totalDevices) * 100 * 100) / 100
        : 100;

    const totalTickets = safeCount(totalTicketsR);
    const openTickets = safeCount(openTicketsR);
    const resolvedTickets = safeCount(resolvedTicketsR);
    const criticalTickets = safeCount(criticalTicketsR);
    const ticketResolutionRate =
      totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

    const totalAssets = safeCount(totalAssetsR);
    const activeAssets = safeCount(activeAssetsR);

    const complianceRow = complianceScansR.data?.rows?.[0] ?? {
      total: "0",
      passed: "0",
      failed: "0",
    };
    const totalControls = parseInt(String(complianceRow.total ?? "0"), 10);
    const passedControls = parseInt(String(complianceRow.passed ?? "0"), 10);
    const failedControls = parseInt(String(complianceRow.failed ?? "0"), 10);
    const complianceScore =
      totalControls > 0
        ? Math.round((passedControls / totalControls) * 100)
        : 0;

    const capacityAlerts = safeCount(capacityAlertsR);
    const sslExpiring = safeCount(sslExpiringR);
    const sslExpired = safeCount(sslExpiredR);
    const firewallRules = safeCount(firewallRulesR);
    const totalBackups = safeCount(totalBackupsR);
    const successfulBackups = safeCount(successfulBackupsR);
    const kbArticles = safeCount(kbArticlesR);
    const activeTasks = safeCount(activeTasksR);
    const activeApiKeys = safeCount(activeApiKeysR);
    const activeWebhooks = safeCount(activeWebhooksR);
    const unreadNotifications = safeCount(unreadNotificationsR);

    const healthChecks = safeRows(healthChecksR);
    const criticalHealth = healthChecks.find((r) => r.severity === "critical")
      ? parseInt(
          (healthChecks.find((r) => r.severity === "critical")
            ?.count as string) ?? "0",
          10,
        )
      : 0;

    logger.info("Executive dashboard overview concluido", {
      tenantId,
      durationMs: Date.now() - startedAt,
    });

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
  } catch (error) {
    logger.error("Erro no executive dashboard overview", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    return c.json(
      {
        error: {
          code: "EXECUTIVE_DASHBOARD_ERROR",
          message: "Falha ao carregar dados do dashboard executivo",
        },
      },
      500,
    );
  }
});

// ========== Trends (last 7 days) ==========

executiveDashboardRoute.get("/trends", httpCache(120), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const startedAt = Date.now();

  try {
    const [
      ticketTrendsR,
      deviceStatusR,
      backupTrendsR,
      notificationTrendsR,
      auditTrendsR,
    ] = await Promise.all([
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count,
           COUNT(*) FILTER (WHERE status = 'resolved') as resolved
           FROM public.tickets WHERE tenant_id = $1
             AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY DATE(created_at) ORDER BY date`,
        [tenantId],
      ),
      query(
        `SELECT status, COUNT(*) as count FROM public.devices WHERE tenant_id = $1 GROUP BY status`,
        [tenantId],
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('completed','verified')) as completed,
           COUNT(*) FILTER (WHERE status = 'failed') as failed
           FROM public.backup_snapshots WHERE tenant_id = $1
             AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY DATE(created_at) ORDER BY date`,
        [tenantId],
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count,
           COUNT(*) FILTER (WHERE severity = 'critical') as critical
           FROM public.notification_log WHERE tenant_id = $1
             AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY DATE(created_at) ORDER BY date`,
        [tenantId],
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM public.audit_log WHERE tenant_id = $1
             AND created_at >= timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY DATE(created_at) ORDER BY date`,
        [tenantId],
      ),
    ]);

    logger.info("Executive dashboard trends concluido", {
      tenantId,
      durationMs: Date.now() - startedAt,
    });

    return c.json({
      tickets: safeRows(ticketTrendsR),
      devices: safeRows(deviceStatusR),
      backups: safeRows(backupTrendsR),
      notifications: safeRows(notificationTrendsR),
      audit: safeRows(auditTrendsR),
    });
  } catch (error) {
    logger.error("Erro no executive dashboard trends", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    return c.json(
      {
        error: {
          code: "EXECUTIVE_TRENDS_ERROR",
          message: "Falha ao carregar tendências",
        },
      },
      500,
    );
  }
});

// ========== Alerts Summary ==========

executiveDashboardRoute.get("/alerts", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const startedAt = Date.now();

  try {
    const [
      criticalTicketsR,
      sslAlertsR,
      capacityRisksR,
      failedBackupsR,
      healthAlertsR,
    ] = await Promise.all([
      query(
        `SELECT id, subject, priority, status, created_at FROM public.tickets
           WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')
           ORDER BY created_at DESC LIMIT 5`,
        [tenantId],
      ),
      query(
        `SELECT id, hostname, status, valid_to FROM public.ssl_certificates_with_status
           WHERE tenant_id = $1 AND status IN ('expiring_soon', 'expired')
           ORDER BY valid_to ASC LIMIT 5`,
        [tenantId],
      ),
      query(
        `SELECT id, resource_name, resource_type, confidence, generated_at FROM public.capacity_forecasts
           WHERE tenant_id = $1 AND confidence IN ('high', 'medium')
           ORDER BY generated_at ASC LIMIT 5`,
        [tenantId],
      ),
      query(
        `SELECT id, file_path, status, error_message, created_at FROM public.backup_snapshots
           WHERE tenant_id = $1 AND status = 'failed'
           ORDER BY created_at DESC LIMIT 5`,
        [tenantId],
      ),
      query(
        `SELECT id, check_name, severity, message, last_check_at FROM public.system_health_checks
           WHERE tenant_id = $1 AND severity IN ('critical', 'warning')
           ORDER BY last_check_at DESC LIMIT 5`,
        [tenantId],
      ),
    ]);

    const criticalTickets = safeRows(criticalTicketsR);
    const sslAlerts = safeRows(sslAlertsR);
    const capacityRisks = safeRows(capacityRisksR);
    const failedBackups = safeRows(failedBackupsR);
    const healthAlerts = safeRows(healthAlertsR);

    const totalAlerts =
      criticalTickets.length +
      sslAlerts.length +
      capacityRisks.length +
      failedBackups.length +
      healthAlerts.length;

    logger.info("Executive dashboard alerts concluido", {
      tenantId,
      totalAlerts,
      durationMs: Date.now() - startedAt,
    });

    return c.json({
      total_alerts: totalAlerts,
      critical_tickets: criticalTickets,
      ssl_alerts: sslAlerts,
      capacity_risks: capacityRisks,
      failed_backups: failedBackups,
      health_alerts: healthAlerts,
    });
  } catch (error) {
    logger.error("Erro no executive dashboard alerts", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    return c.json(
      {
        error: {
          code: "EXECUTIVE_ALERTS_ERROR",
          message: "Falha ao carregar alertas executivos",
        },
      },
      500,
    );
  }
});

// ========== Summary Cards ==========

executiveDashboardRoute.get("/summary", httpCache(60), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const startedAt = Date.now();

  try {
    const [topDevicesR, recentActivityR, recentTicketsR, recentBackupsR] =
      await Promise.all([
        query(
          `SELECT hostname, status, ip, updated_at FROM public.devices
           WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 5`,
          [tenantId],
        ),
        query(
          `SELECT action, entity_type, entity_id, created_at FROM public.audit_log
           WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [tenantId],
        ),
        query(
          `SELECT id, subject, priority, status, created_at FROM public.tickets
           WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
          [tenantId],
        ),
        query(
          `SELECT id, file_path, status, created_at FROM public.backup_snapshots
           WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
          [tenantId],
        ),
      ]);

    logger.info("Executive dashboard summary concluido", {
      tenantId,
      durationMs: Date.now() - startedAt,
    });

    return c.json({
      top_devices: safeRows(topDevicesR),
      recent_activity: safeRows(recentActivityR),
      recent_tickets: safeRows(recentTicketsR),
      recent_backups: safeRows(recentBackupsR),
    });
  } catch (error) {
    logger.error("Erro no executive dashboard summary", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    return c.json(
      {
        error: {
          code: "EXECUTIVE_SUMMARY_ERROR",
          message: "Falha ao carregar resumo executivo",
        },
      },
      500,
    );
  }
});
