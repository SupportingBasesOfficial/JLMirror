// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeCount, safeRows } from "../lib/query-helpers.js";
import { syncTenantDevices } from "../lib/device-sync.js";
import "../types.js";

export const dashboardRoute = new Hono();

dashboardRoute.use("/*", requirePermission("dashboard:read"));

// ========== Cross-Feature Dashboard ==========

// GET /api/v1/dashboard — redireciona para overview
dashboardRoute.get("/", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const [totalDevicesR, onlineDevicesR, openTicketsR, criticalTicketsR] =
    await Promise.all([
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status NOT IN ('resolved','closed','cancelled')",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')",
        [tenantId],
      ),
    ]);

  return c.json({
    kpis: {
      devices: {
        total: safeCount(totalDevicesR),
        online: safeCount(onlineDevicesR),
      },
      tickets: {
        open: safeCount(openTicketsR),
        critical: safeCount(criticalTicketsR),
      },
    },
  });
});

dashboardRoute.get("/overview", httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Devices — tabela em public.devices com RLS
  const [
    totalDevicesR,
    onlineDevicesR,
    openTicketsR,
    criticalTicketsR,
    complianceScansR,
    sslCertsR,
    sslExpiringR,
    totalBackupsR,
    successfulBackupsR,
    firewallRulesR,
    activeFirewallRulesR,
    pendingChangesR,
    inProgressChangesR,
    totalAssetsR,
    totalScriptsR,
    unreadNotificationsR,
    recentActivityR,
    recentTicketsR,
    upcomingChangesR,
    sslExpiringSoonR,
  ] = await Promise.all([
    query("SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1", [
      tenantId,
    ]),
    query(
      "SELECT COUNT(*) as count FROM public.devices WHERE tenant_id = $1 AND status = 'active'",
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND status NOT IN ('resolved','closed','cancelled')",
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.tickets WHERE tenant_id = $1 AND priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled')",
      [tenantId],
    ),
    query(
      `SELECT COALESCE(SUM(total_checks), 0) as total, COALESCE(SUM(passed_checks), 0) as passed
       FROM public.compliance_scans WHERE tenant_id = $1 AND status = 'completed'`,
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.ssl_certificates WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
    query(
      `SELECT COUNT(*) as count FROM public.ssl_certificates
       WHERE tenant_id = $1 AND is_active = true AND valid_to <= timezone('utc'::text, now()) + INTERVAL '30 days'`,
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
      "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1",
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.firewall_rules WHERE tenant_id = $1 AND is_active = true",
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status IN ('submitted','under_review')",
      [tenantId],
    ),
    query(
      "SELECT COUNT(*) as count FROM public.change_requests WHERE tenant_id = $1 AND status = 'in_progress'",
      [tenantId],
    ),
    query("SELECT COUNT(*) as count FROM public.assets WHERE tenant_id = $1", [
      tenantId,
    ]),
    query("SELECT COUNT(*) as count FROM public.scripts WHERE tenant_id = $1", [
      tenantId,
    ]),
    query(
      `SELECT COUNT(*) as count FROM public.notification_log
       WHERE tenant_id = $1 AND status = 'sent' AND created_at > timezone('utc'::text, now()) - INTERVAL '24 hours'`,
      [tenantId],
    ),
    query(
      `SELECT action, entity_type, created_at FROM public.audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [tenantId],
    ),
    query(
      `SELECT id, subject, status, priority, created_at FROM public.tickets WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    ),
    query(
      `SELECT id, rfc_number, title, planned_start_at, priority FROM public.change_requests
       WHERE tenant_id = $1 AND status IN ('approved','scheduled') AND planned_start_at >= timezone('utc'::text, now())
       ORDER BY planned_start_at ASC LIMIT 5`,
      [tenantId],
    ),
    query(
      `SELECT id, hostname, valid_to FROM public.ssl_certificates
       WHERE tenant_id = $1 AND is_active = true AND valid_to <= timezone('utc'::text, now()) + INTERVAL '30 days'
       ORDER BY valid_to ASC LIMIT 5`,
      [tenantId],
    ),
  ]);

  const totalDevices = safeCount(totalDevicesR);
  const onlineDevices = safeCount(onlineDevicesR);
  const openTickets = safeCount(openTicketsR);
  const criticalTickets = safeCount(criticalTicketsR);
  const complianceRow = complianceScansR.data?.rows?.[0] ?? {
    total: "0",
    passed: "0",
  };
  const complianceTotal = parseInt(String(complianceRow.total ?? "0"), 10);
  const compliancePassed = parseInt(String(complianceRow.passed ?? "0"), 10);
  const complianceRate =
    complianceTotal > 0
      ? Math.round((compliancePassed / complianceTotal) * 100)
      : 0;
  const sslCerts = safeCount(sslCertsR);
  const sslExpiring = safeCount(sslExpiringR);
  const totalBackups = safeCount(totalBackupsR);
  const successfulBackups = safeCount(successfulBackupsR);
  const firewallRules = safeCount(firewallRulesR);
  const activeFirewallRules = safeCount(activeFirewallRulesR);
  const pendingChanges = safeCount(pendingChangesR);
  const inProgressChanges = safeCount(inProgressChangesR);
  const totalAssets = safeCount(totalAssetsR);
  const totalScripts = safeCount(totalScriptsR);
  const unreadNotifications = safeCount(unreadNotificationsR);
  const recentActivity = safeRows(recentActivityR);
  const recentTickets = safeRows(recentTicketsR);
  const upcomingChanges = safeRows(upcomingChangesR);
  const sslExpiringSoon = safeRows(sslExpiringSoonR);

  return c.json({
    kpis: {
      devices: { total: totalDevices, online: onlineDevices },
      tickets: { open: openTickets, critical: criticalTickets },
      compliance: {
        total: complianceTotal,
        compliant: compliancePassed,
        rate: complianceRate,
      },
      ssl: { total: sslCerts, expiring: sslExpiring },
      backups: {
        total: totalBackups,
        successful: successfulBackups,
        rate:
          totalBackups > 0
            ? Math.round((successfulBackups / totalBackups) * 100)
            : 0,
      },
      firewall: { total: firewallRules, active: activeFirewallRules },
      changes: { pending: pendingChanges, in_progress: inProgressChanges },
      assets: { total: totalAssets },
      scripts: { total: totalScripts },
      notifications: { unread: unreadNotifications },
    },
    recent_activity: recentActivity,
    recent_tickets: recentTickets,
    upcoming_changes: upcomingChanges,
    ssl_expiring_soon: sslExpiringSoon,
  });
});

// ========== On-Demand Device Sync ==========

// POST /api/v1/dashboard/sync-devices — sincroniza devices do Zabbix sob demanda
// Usado no primeiro login do cliente para não esperar o intervalo de 5 min
dashboardRoute.post("/sync-devices", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  if (!tenantId) {
    return c.json(
      { error: { code: "NO_TENANT", message: "Usuário sem tenant associado" } },
      400,
    );
  }

  // Busca config do Zabbix para o tenant
  const configResult = await query<{
    zabbix_api_url: string;
    zabbix_encrypted_token: string;
    zabbix_token_iv: string;
    zabbix_token_tag: string;
    zabbix_host_group_id: string;
  }>(
    `SELECT zabbix_api_url, zabbix_encrypted_token, zabbix_token_iv, zabbix_token_tag, zabbix_host_group_id
     FROM public.tenant_routes
     WHERE tenant_id = $1 AND status = 'active'
       AND zabbix_encrypted_token IS NOT NULL
       AND zabbix_token_iv IS NOT NULL
       AND zabbix_token_tag IS NOT NULL`,
    [tenantId],
  );

  if (!configResult.data?.rows[0]) {
    return c.json(
      {
        error: {
          code: "NO_ZABBIX_CONFIG",
          message: "Integração Zabbix não configurada",
        },
      },
      404,
    );
  }

  try {
    const result = await syncTenantDevices({
      tenant_id: tenantId,
      ...configResult.data.rows[0],
    });

    return c.json({
      success: true,
      synced: result.synced,
      total: result.total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ error: { code: "SYNC_FAILED", message } }, 502);
  }
});

// ========== Quick Links / Navigation ==========

dashboardRoute.get("/navigation", async (c) => {
  return c.json({
    sections: [
      {
        label: "Monitoramento",
        items: [
          { label: "Dashboard", href: "/dashboard", icon: "grid" },
          {
            label: "Dashboard Executivo",
            href: "/executive-dashboard",
            icon: "chart",
          },
          { label: "Devices", href: "/dashboard/devices", icon: "server" },
          { label: "K8s", href: "/k8s", icon: "k8s" },
          { label: "System Health", href: "/system-health", icon: "heart" },
        ],
      },
      {
        label: "Segurança",
        items: [
          { label: "Firewall", href: "/firewall", icon: "shield" },
          { label: "SSL Certificados", href: "/ssl", icon: "lock" },
          { label: "Compliance", href: "/compliance", icon: "check" },
          { label: "MFA & RBAC", href: "/security", icon: "key" },
        ],
      },
      {
        label: "Operações",
        items: [
          { label: "Backups", href: "/backups", icon: "archive" },
          { label: "Assets", href: "/assets", icon: "box" },
          { label: "Capacity", href: "/capacity", icon: "gauge" },
          { label: "Change Management", href: "/changes", icon: "git" },
          { label: "Scripts", href: "/automation", icon: "code" },
        ],
      },
      {
        label: "Gestão",
        items: [
          { label: "Tickets", href: "/tickets", icon: "ticket" },
          { label: "Knowledge Base", href: "/knowledge-base", icon: "book" },
          { label: "Relatórios", href: "/reports", icon: "file" },
          { label: "Notificações", href: "/notifications", icon: "bell" },
        ],
      },
      {
        label: "Admin",
        items: [
          { label: "API Keys", href: "/api-keys", icon: "key" },
          { label: "Webhooks", href: "/webhooks", icon: "webhook" },
          { label: "Scheduled Tasks", href: "/scheduled-tasks", icon: "clock" },
          { label: "Feature Flags", href: "/feature-flags", icon: "flag" },
          { label: "Data Transfer", href: "/data-transfer", icon: "transfer" },
          { label: "Settings", href: "/settings", icon: "settings" },
          { label: "Logs", href: "/logs", icon: "log" },
          { label: "Traces", href: "/traces", icon: "trace" },
        ],
      },
    ],
  });
});
