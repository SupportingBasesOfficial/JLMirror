import { Hono } from "hono";
import { query } from "@repo/db";
import { exec } from "node:child_process";
import {
  createFirewallRuleSchema,
  updateFirewallRuleSchema,
  applyFirewallSchema,
  type CreateFirewallRuleInput,
  type UpdateFirewallRuleInput,
  type ApplyFirewallInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const firewallRoute = new Hono();

// Executa comando SSH remoto e retorna saida
function execSshCommand(host: string, command: string, timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // eslint-disable-next-line security/detect-child-process
    exec(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "${command.replace(/"/g, '\\"')}"`, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error ? (error.code as number ?? 1) : 0 });
    });
  });
}

interface FirewallRule {
  id: string;
  host: string;
  backend: string;
  chain: string;
  action: string;
  protocol: string | null;
  source_ip: string | null;
  source_port: string | null;
  destination_ip: string | null;
  destination_port: string | null;
  interface_in: string | null;
  interface_out: string | null;
  state: string | null;
  priority: number;
  is_enabled: boolean;
  description: string | null;
}

// GET /api/v1/firewall/rules — lista regras (filtra por host)
firewallRoute.get("/rules", jwtAuth, tenantContext, requirePermission("firewall:read"), async (c) => {
  const user = c.get("user");
  const host = c.req.query("host");
  const enabledOnly = c.req.query("enabled") === "true";

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (host) {
    conditions.push(`host = $${paramIdx++}`);
    params.push(host);
  }
  if (enabledOnly) {
    conditions.push("is_enabled = true");
  }

  const result = await query(
    `SELECT * FROM public.firewall_rules WHERE ${conditions.join(" AND ")} ORDER BY host, priority, created_at`,
    params,
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } }, 500);
  }

  return c.json({ rules: result.data?.rows ?? [] });
});

// GET /api/v1/firewall/rules/:id — detalhe
firewallRoute.get("/rules/:id", jwtAuth, tenantContext, requirePermission("firewall:read"), async (c) => {
  const ruleId = c.req.param("id");
  const user = c.get("user");

  const result = await query(
    "SELECT * FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
    [ruleId, user?.tenant_id ?? null],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Regra não encontrada" } }, 404);
  }

  const versionsResult = await query(
    "SELECT id, version, change_summary, changed_by, created_at FROM public.firewall_rule_versions WHERE rule_id = $1 ORDER BY version DESC",
    [ruleId],
  );

  return c.json({
    rule: result.data.rows[0],
    versions: versionsResult.data?.rows ?? [],
  });
});

// POST /api/v1/firewall/rules — cria regra
firewallRoute.post("/rules", jwtAuth, tenantContext, requirePermission("firewall:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateFirewallRuleInput>();
  const parsed = createFirewallRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.firewall_rules (tenant_id, host, backend, chain, action, protocol, source_ip, source_port,
     destination_ip, destination_port, interface_in, interface_out, state, priority, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.host, data.backend, data.chain, data.action,
      data.protocol ?? null, data.source_ip ?? null, data.source_port ?? null,
      data.destination_ip ?? null, data.destination_port ?? null,
      data.interface_in ?? null, data.interface_out ?? null, data.state ?? null,
      data.priority, data.description ?? null, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } }, 500);
  }

  const ruleId = result.data.rows[0].id;

  // Registra versão inicial
  await query(
    "INSERT INTO public.firewall_rule_versions (rule_id, version, snapshot, changed_by, change_summary) VALUES ($1, 1, $2, $3, 'Regra criada')",
    [ruleId, JSON.stringify(data), user.sub],
  );

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'firewall.rule.create', 'firewall_rule', $2, $3, NULL, NULL)",
    [user.sub, ruleId, JSON.stringify({ host: data.host, action: data.action, chain: data.chain })],
  );

  return c.json({ id: ruleId }, 201);
});

// PUT /api/v1/firewall/rules/:id — atualiza regra
firewallRoute.put("/rules/:id", jwtAuth, tenantContext, requirePermission("firewall:write"), async (c) => {
  const ruleId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateFirewallRuleInput>();
  const parsed = updateFirewallRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Busca versão atual
  const currentResult = await query<{ version: number }>(
    "SELECT version FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
    [ruleId, user?.tenant_id ?? null],
  );

  if (currentResult.error || !currentResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Regra não encontrada" } }, 404);
  }

  const current = currentResult.data.rows[0];
  const newVersion = current.version + 1;

  const updateFields: string[] = [];
  const updateParams: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    host: "host", backend: "backend", chain: "chain", action: "action",
    protocol: "protocol", source_ip: "source_ip", source_port: "source_port",
    destination_ip: "destination_ip", destination_port: "destination_port",
    interface_in: "interface_in", interface_out: "interface_out", state: "state",
    priority: "priority", description: "description", is_enabled: "is_enabled",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      updateParams.push(data[key as keyof typeof data]);
    }
  }

  if (updateFields.length === 0) {
    return c.json({ id: ruleId, version: current.version });
  }

  updateParams.push(ruleId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.firewall_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    updateParams,
  );

  // Registra versão
  await query(
    "INSERT INTO public.firewall_rule_versions (rule_id, version, snapshot, changed_by, change_summary) VALUES ($1, $2, $3, $4, $5)",
    [ruleId, newVersion, JSON.stringify(data), user.sub, data.description ?? "Atualização de regra"],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'firewall.rule.update', 'firewall_rule', $2, $3, NULL, NULL)",
    [user.sub, ruleId, JSON.stringify({ version: newVersion })],
  );

  return c.json({ id: ruleId, version: newVersion });
});

// DELETE /api/v1/firewall/rules/:id — remove regra
firewallRoute.delete("/rules/:id", jwtAuth, tenantContext, requirePermission("firewall:write"), async (c) => {
  const ruleId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
    [ruleId, user?.tenant_id ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'firewall.rule.delete', 'firewall_rule', $2, NULL, NULL, NULL)",
    [user.sub, ruleId],
  );

  return c.json({ deleted: true });
});

// POST /api/v1/firewall/dry-run — simula aplicação e gera diff
firewallRoute.post("/dry-run", jwtAuth, tenantContext, requirePermission("firewall:read"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<ApplyFirewallInput>();
  const parsed = applyFirewallSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const { host } = parsed.data;

  // Busca regras ativas do host
  const result = await query<FirewallRule>(
    "SELECT * FROM public.firewall_rules WHERE tenant_id = $1 AND host = $2 AND is_enabled = true ORDER BY priority",
    [user?.tenant_id ?? null, host],
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } }, 500);
  }

  const rules = (result.data?.rows ?? []) as unknown as FirewallRule[];

  // Gera comandos que seriam executados
  const commands = rules.map((rule) => {
    if (rule.backend === "iptables") {
      return {
        rule_id: rule.id,
        command: `iptables -A ${rule.chain}${rule.protocol ? ` -p ${rule.protocol}` : ""}${rule.source_ip ? ` -s ${rule.source_ip}` : ""}${rule.destination_ip ? ` -d ${rule.destination_ip}` : ""}${rule.destination_port ? ` --dport ${rule.destination_port}` : ""}${rule.interface_in ? ` -i ${rule.interface_in}` : ""} -j ${rule.action}`,
        description: rule.description,
      };
    } else if (rule.backend === "nftables") {
      return {
        rule_id: rule.id,
        command: `nft add rule inet filter ${rule.chain.toLowerCase()}${rule.protocol ? ` ${rule.protocol}` : ""}${rule.source_ip ? ` ip saddr ${rule.source_ip}` : ""}${rule.destination_ip ? ` ip daddr ${rule.destination_ip}` : ""}${rule.destination_port ? ` dport ${rule.destination_port}` : ""} ${rule.action.toLowerCase()}`,
        description: rule.description,
      };
    }
    return {
      rule_id: rule.id,
      command: `ufw ${rule.action === "ACCEPT" ? "allow" : "deny"} ${rule.destination_port ?? ""}${rule.protocol ? `/${rule.protocol}` : ""}`,
      description: rule.description,
    };
  });

  // Registra dry-run
  await query(
    "INSERT INTO public.firewall_changes (tenant_id, host, change_type, status, rules_applied, diff_after, applied_by) VALUES ($1, $2, 'dry_run', 'success', $3, $4, $5)",
    [user?.tenant_id ?? null, host, rules.length, JSON.stringify(commands), user.sub],
  );

  return c.json({
    host,
    dry_run: true,
    rules_count: rules.length,
    commands,
  });
});

// POST /api/v1/firewall/apply — aplica regras no host (via SSH)
firewallRoute.post("/apply", jwtAuth, tenantContext, requirePermission("firewall:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<ApplyFirewallInput>();
  const parsed = applyFirewallSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const { host, dry_run } = parsed.data;

  // Busca regras ativas
  const result = await query<FirewallRule>(
    "SELECT * FROM public.firewall_rules WHERE tenant_id = $1 AND host = $2 AND is_enabled = true ORDER BY priority",
    [user?.tenant_id ?? null, host],
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } }, 500);
  }

  const rules = (result.data?.rows ?? []) as unknown as FirewallRule[];

  // Gera comandos
  const commands = rules.map((rule) => {
    if (rule.backend === "iptables") {
      return `iptables -A ${rule.chain}${rule.protocol ? ` -p ${rule.protocol}` : ""}${rule.source_ip ? ` -s ${rule.source_ip}` : ""}${rule.destination_ip ? ` -d ${rule.destination_ip}` : ""}${rule.destination_port ? ` --dport ${rule.destination_port}` : ""}${rule.interface_in ? ` -i ${rule.interface_in}` : ""} -j ${rule.action}`;
    } else if (rule.backend === "nftables") {
      return `nft add rule inet filter ${rule.chain.toLowerCase()}${rule.protocol ? ` ${rule.protocol}` : ""}${rule.source_ip ? ` ip saddr ${rule.source_ip}` : ""}${rule.destination_ip ? ` ip daddr ${rule.destination_ip}` : ""}${rule.destination_port ? ` dport ${rule.destination_port}` : ""} ${rule.action.toLowerCase()}`;
    }
    return `ufw ${rule.action === "ACCEPT" ? "allow" : "deny"} ${rule.destination_port ?? ""}${rule.protocol ? `/${rule.protocol}` : ""}`;
  });

  // Executa comandos reais via SSH (ou local se host for localhost)
  const startTime = Date.now();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let allSuccess = true;

  for (const cmd of commands) {
    if (dry_run) {
      stdoutLines.push(`[DRY-RUN] ${cmd}`);
      continue;
    }

    const result = isLocal
      ? await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
          // eslint-disable-next-line security/detect-child-process
        exec(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
            resolve({ stdout, stderr, exitCode: error ? (error.code as number ?? 1) : 0 });
          });
        })
      : await execSshCommand(host, cmd);

    if (result.stdout) stdoutLines.push(result.stdout.trim());
    if (result.stderr) stderrLines.push(result.stderr.trim());
    if (result.exitCode !== 0) {
      allSuccess = false;
      stderrLines.push(`[EXIT ${result.exitCode}] ${cmd}`);
    }
  }

  const stdout = stdoutLines.join("\n");
  const stderr = dry_run ? "[DRY-RUN] Comandos nao foram executados no host" : stderrLines.join("\n");
  const durationMs = Date.now() - startTime;
  const status = dry_run ? "success" : allSuccess ? "success" : "partial";

  // Registra mudança
  await query(
    "INSERT INTO public.firewall_changes (tenant_id, host, change_type, status, rules_applied, diff_after, stdout, stderr, duration_ms, applied_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [
      user?.tenant_id ?? null, host,
      dry_run ? "dry_run" : "apply",
      status,
      rules.length, JSON.stringify(commands),
      stdout, stderr, durationMs, user.sub,
    ],
  );

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'firewall.apply', 'firewall', $2, $3, NULL, NULL)",
    [user.sub, host, JSON.stringify({ dry_run, rules_count: rules.length, success: allSuccess })],
  );

  return c.json({
    host,
    dry_run,
    rules_count: rules.length,
    commands,
    stdout,
    stderr,
    status,
    duration_ms: durationMs,
  });
});

// GET /api/v1/firewall/changes — histórico de mudanças
firewallRoute.get("/changes", jwtAuth, tenantContext, requirePermission("firewall:read"), async (c) => {
  const user = c.get("user");
  const host = c.req.query("host");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (host) {
    conditions.push(`host = $${paramIdx++}`);
    params.push(host);
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT * FROM public.firewall_changes WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json({
    changes: result.data?.rows ?? [],
    limit,
    offset,
  });
});

// GET /api/v1/firewall/hosts — lista hosts com regras
firewallRoute.get("/hosts", jwtAuth, tenantContext, requirePermission("firewall:read"), async (c) => {
  const user = c.get("user");

  const result = await query(
    "SELECT DISTINCT host, COUNT(*) as rule_count, COUNT(*) FILTER (WHERE is_enabled = true) as enabled_count FROM public.firewall_rules WHERE tenant_id = $1 GROUP BY host ORDER BY host",
    [user?.tenant_id ?? null],
  );

  return c.json({
    hosts: result.data?.rows ?? [],
  });
});
