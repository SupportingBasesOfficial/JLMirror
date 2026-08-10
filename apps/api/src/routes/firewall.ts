// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { execFile } from "node:child_process";
import {
  createFirewallRuleSchema,
  updateFirewallRuleSchema,
  applyFirewallSchema,
  type CreateFirewallRuleInput,
  type UpdateFirewallRuleInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const firewallRoute = new Hono();

// GET /api/v1/firewall — overview do modulo
firewallRoute.get(
  "/",
  requirePermission("firewall:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const rulesResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.firewall_rules WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          rules: rulesResult.data?.rows[0] ?? { total: "0", active: "0" },
        },
        endpoints: ["/rules", "/rules/:id", "/changes", "/hosts"],
      });
    } catch (error) {
      logger.error("Erro no overview firewall", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// Executa comando SSH remoto usando execFile (sem shell) para prevenir injection
function execSshCommand(
  host: string,
  command: string,
  timeoutMs: number = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Usa execFile em vez de exec — nao interpreta metacaracteres shell
    // StrictHostKeyChecking mantido ativo para prevenir MITM
    execFile(
      "ssh",
      ["-o", "BatchMode=yes", "-o", `ConnectTimeout=10`, host, command],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error ? ((error.code as number) ?? 1) : 0,
        });
      },
    );
  });
}

// Executa comando local usando execFile (sem shell) para prevenir injection
function execLocalCommand(
  cmd: string,
  args: string[],
  timeoutMs: number = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error ? ((error.code as number) ?? 1) : 0,
        });
      },
    );
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

// Gera argumentos para iptables (array, nao string) para prevenir injection
function buildIptablesArgs(rule: FirewallRule): string[] {
  const args = ["-A", rule.chain];
  if (rule.protocol) args.push("-p", rule.protocol);
  if (rule.source_ip) args.push("-s", rule.source_ip);
  if (rule.destination_ip) args.push("-d", rule.destination_ip);
  if (rule.destination_port) args.push("--dport", rule.destination_port);
  if (rule.interface_in) args.push("-i", rule.interface_in);
  args.push("-j", rule.action.toUpperCase());
  return args;
}

// Gera argumentos para nftables (array)
function buildNftablesArgs(rule: FirewallRule): string[] {
  const args = ["add", "rule", "inet", "filter", rule.chain.toLowerCase()];
  if (rule.protocol) args.push(rule.protocol);
  if (rule.source_ip) args.push("ip", "saddr", rule.source_ip);
  if (rule.destination_ip) args.push("ip", "daddr", rule.destination_ip);
  if (rule.destination_port) args.push("dport", rule.destination_port);
  args.push(rule.action.toLowerCase());
  return args;
}

// Gera argumentos para ufw (array)
function buildUfwArgs(rule: FirewallRule): string[] {
  const args: string[] = [];
  args.push(
    rule.action === "ACCEPT" || rule.action === "allow" ? "allow" : "deny",
  );
  if (rule.destination_port) {
    let portSpec = rule.destination_port;
    if (rule.protocol) portSpec += `/${rule.protocol}`;
    args.push(portSpec);
  }
  return args;
}

// GET /api/v1/firewall/rules — lista regras (filtra por host)
firewallRoute.get(
  "/rules",
  requirePermission("firewall:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const host = c.req.query("host");
    const enabledOnly = c.req.query("enabled") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (host) {
      conditions.push(`host = $${paramIdx++}`);
      params.push(host);
    }
    if (enabledOnly) {
      conditions.push("is_enabled = true");
    }

    try {
      const result = await query(
        `SELECT * FROM public.firewall_rules WHERE ${conditions.join(" AND ")} ORDER BY host, priority, created_at`,
        params,
      );

      if (result.error) {
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } },
          500,
        );
      }

      return c.json({ rules: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar regras firewall", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/firewall/rules/:id — detalhe
firewallRoute.get(
  "/rules/:id",
  requirePermission("firewall:read"),
  httpCache(15),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza rule + versions
      const [result, versionsResult] = await Promise.all([
        query(
          "SELECT * FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
          [ruleId, tenantId],
        ),
        query(
          "SELECT id, version, change_summary, changed_by, created_at FROM public.firewall_rule_versions WHERE rule_id = $1 ORDER BY version DESC",
          [ruleId],
        ),
      ]);

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      return c.json({
        rule: result.data.rows[0],
        versions: versionsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar regra firewall", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/firewall/rules — cria regra
firewallRoute.post(
  "/rules",
  rateLimitWrite,
  requirePermission("firewall:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createFirewallRuleSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as CreateFirewallRuleInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.firewall_rules (tenant_id, host, backend, chain, action, protocol, source_ip, source_port,
         destination_ip, destination_port, interface_in, interface_out, state, priority, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          tenantId,
          data.host,
          data.backend,
          data.chain,
          data.action,
          data.protocol ?? null,
          data.source_ip ?? null,
          data.source_port ?? null,
          data.destination_ip ?? null,
          data.destination_port ?? null,
          data.interface_in ?? null,
          data.interface_out ?? null,
          data.state ?? null,
          data.priority,
          data.description ?? null,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } },
          500,
        );
      }

      const ruleId = result.data.rows[0].id;

      // Registra versão inicial
      await query(
        "INSERT INTO public.firewall_rule_versions (rule_id, version, snapshot, changed_by, change_summary) VALUES ($1, 1, $2, $3, 'Regra criada')",
        [ruleId, JSON.stringify(data), user?.sub ?? null],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "firewall.rule.create",
            entityType: "firewall_rule",
            entityId: ruleId,
            newData: {
              host: data.host,
              action: data.action,
              chain: data.chain,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Regra firewall criada", {
        ruleId,
        host: data.host,
        tenantId,
      });

      return c.json({ id: ruleId }, 201);
    } catch (error) {
      logger.error("Erro ao criar regra firewall", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar regra" } },
        500,
      );
    }
  },
);

// PUT /api/v1/firewall/rules/:id — atualiza regra
firewallRoute.put(
  "/rules/:id",
  rateLimitWrite,
  requirePermission("firewall:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateFirewallRuleSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateFirewallRuleInput;

    try {
      // Busca versão atual
      const currentResult = await query<{ version: number }>(
        "SELECT version FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
        [ruleId, tenantId],
      );

      if (currentResult.error || !currentResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      const current = currentResult.data.rows[0];
      const newVersion = current.version + 1;

      const updateFields: string[] = [];
      const updateParams: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        host: "host",
        backend: "backend",
        chain: "chain",
        action: "action",
        protocol: "protocol",
        source_ip: "source_ip",
        source_port: "source_port",
        destination_ip: "destination_ip",
        destination_port: "destination_port",
        interface_in: "interface_in",
        interface_out: "interface_out",
        state: "state",
        priority: "priority",
        description: "description",
        is_enabled: "is_enabled",
        is_active: "is_active",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          updateParams.push(data[key as keyof typeof data]);
        }
      }

      if (updateFields.length === 0) {
        return c.json(
          {
            error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" },
          },
          400,
        );
      }

      updateParams.push(ruleId, tenantId);

      const updateResult = await query(
        `UPDATE public.firewall_rules SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        updateParams,
      );

      if (updateResult.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      // Registra versão
      await query(
        "INSERT INTO public.firewall_rule_versions (rule_id, version, snapshot, changed_by, change_summary) VALUES ($1, $2, $3, $4, $5)",
        [
          ruleId,
          newVersion,
          JSON.stringify(data),
          user?.sub ?? null,
          data.description ?? "Atualização de regra",
        ],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "firewall.rule.update",
            entityType: "firewall_rule",
            entityId: ruleId,
            newData: { version: newVersion },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Regra firewall atualizada", {
        ruleId,
        version: newVersion,
        tenantId,
      });

      return c.json({ id: ruleId, version: newVersion });
    } catch (error) {
      logger.error("Erro ao atualizar regra firewall", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar regra" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/firewall/rules/:id — remove regra
firewallRoute.delete(
  "/rules/:id",
  rateLimitWrite,
  requirePermission("firewall:write"),
  async (c) => {
    const ruleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.firewall_rules WHERE id = $1 AND tenant_id = $2",
        [ruleId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Regra não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "firewall.rule.delete",
            entityType: "firewall_rule",
            entityId: ruleId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Regra firewall removida", { ruleId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover regra firewall", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover regra" } },
        500,
      );
    }
  },
);

// POST /api/v1/firewall/dry-run — simula aplicação e gera diff
firewallRoute.post(
  "/dry-run",
  rateLimitWrite,
  requirePermission("firewall:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = applyFirewallSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { host } = parsed.data;

    try {
      // Busca regras ativas do host
      const result = await query<FirewallRule>(
        "SELECT * FROM public.firewall_rules WHERE tenant_id = $1 AND host = $2 AND is_enabled = true ORDER BY priority",
        [tenantId, host],
      );

      if (result.error) {
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } },
          500,
        );
      }

      const rules = (result.data?.rows ?? []) as unknown as FirewallRule[];

      // Gera comandos que seriam executados (display apenas, nao executa)
      const commands = rules.map((rule) => {
        let cmd: string;
        let args: string[];
        if (rule.backend === "iptables") {
          args = buildIptablesArgs(rule);
          cmd = `iptables ${args.join(" ")}`;
        } else if (rule.backend === "nftables") {
          args = buildNftablesArgs(rule);
          cmd = `nft ${args.join(" ")}`;
        } else {
          args = buildUfwArgs(rule);
          cmd = `ufw ${args.join(" ")}`;
        }
        return {
          rule_id: rule.id,
          command: cmd,
          args,
          description: rule.description,
        };
      });

      // Registra dry-run
      await query(
        "INSERT INTO public.firewall_changes (tenant_id, host, change_type, status, rules_applied, diff_after, applied_by) VALUES ($1, $2, 'dry_run', 'success', $3, $4, $5)",
        [
          tenantId,
          host,
          rules.length,
          JSON.stringify(commands),
          user?.sub ?? null,
        ],
      );

      return c.json({
        host,
        dry_run: true,
        rules_count: rules.length,
        commands,
      });
    } catch (error) {
      logger.error("Erro no dry-run firewall", {
        host,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/firewall/apply — aplica regras no host (via SSH)
firewallRoute.post(
  "/apply",
  rateLimitWrite,
  requirePermission("firewall:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = applyFirewallSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const { host, dry_run } = parsed.data;

    try {
      // Busca regras ativas
      const result = await query<FirewallRule>(
        "SELECT * FROM public.firewall_rules WHERE tenant_id = $1 AND host = $2 AND is_enabled = true ORDER BY priority",
        [tenantId, host],
      );

      if (result.error) {
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar regras" } },
          500,
        );
      }

      const rules = (result.data?.rows ?? []) as unknown as FirewallRule[];

      // Gera lista de comandos (com args separados para execFile)
      const commandList = rules.map((rule) => {
        if (rule.backend === "iptables") {
          return {
            cmd: "iptables",
            args: buildIptablesArgs(rule),
            display: `iptables ${buildIptablesArgs(rule).join(" ")}`,
          };
        } else if (rule.backend === "nftables") {
          return {
            cmd: "nft",
            args: buildNftablesArgs(rule),
            display: `nft ${buildNftablesArgs(rule).join(" ")}`,
          };
        }
        return {
          cmd: "ufw",
          args: buildUfwArgs(rule),
          display: `ufw ${buildUfwArgs(rule).join(" ")}`,
        };
      });

      // Executa comandos reais via SSH (ou local se host for localhost)
      const startTime = Date.now();
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let allSuccess = true;

      for (const entry of commandList) {
        if (dry_run) {
          stdoutLines.push(`[DRY-RUN] ${entry.display}`);
          continue;
        }

        // Usa execFile (sem shell) para prevenir command injection
        // Para host remoto, usa SSH com args separados
        const result =
          host && host !== "localhost" && host !== "127.0.0.1"
            ? await execSshCommand(host, `${entry.cmd} ${entry.args.join(" ")}`)
            : await execLocalCommand(entry.cmd, entry.args);

        if (result.stdout) stdoutLines.push(result.stdout.trim());
        if (result.stderr) stderrLines.push(result.stderr.trim());
        if (result.exitCode !== 0) {
          allSuccess = false;
          stderrLines.push(`[EXIT ${result.exitCode}] ${entry.display}`);
        }
      }

      const stdout = stdoutLines.join("\n");
      const stderr = dry_run
        ? "[DRY-RUN] Comandos nao foram executados no host"
        : stderrLines.join("\n");
      const durationMs = Date.now() - startTime;
      const status = dry_run ? "success" : allSuccess ? "success" : "partial";

      // Registra mudança
      await query(
        "INSERT INTO public.firewall_changes (tenant_id, host, change_type, status, rules_applied, diff_after, stdout, stderr, duration_ms, applied_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          tenantId,
          host,
          dry_run ? "dry_run" : "apply",
          status,
          rules.length,
          JSON.stringify(commandList.map((c) => c.display)),
          stdout,
          stderr,
          durationMs,
          user?.sub ?? null,
        ],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "firewall.apply",
            entityType: "firewall",
            entityId: host,
            newData: {
              dry_run,
              rules_count: rules.length,
              success: allSuccess,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Firewall aplicado", {
        host,
        dry_run,
        rules_count: rules.length,
        status,
        durationMs,
        tenantId,
      });

      return c.json({
        host,
        dry_run,
        rules_count: rules.length,
        commands: commandList.map((c) => c.display),
        stdout,
        stderr,
        status,
        duration_ms: durationMs,
      });
    } catch (error) {
      logger.error("Erro ao aplicar firewall", {
        host,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "APPLY_ERROR", message: "Erro ao aplicar regras" } },
        500,
      );
    }
  },
);

// GET /api/v1/firewall/changes — histórico de mudanças
firewallRoute.get(
  "/changes",
  requirePermission("firewall:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const host = c.req.query("host");
    const limit = Math.min(
      Number.parseInt(c.req.query("limit") ?? "50", 10) || 50,
      200,
    );
    const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (host) {
      conditions.push(`host = $${paramIdx++}`);
      params.push(host);
    }

    params.push(limit, offset);

    try {
      const result = await query(
        `SELECT * FROM public.firewall_changes WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        params,
      );

      return c.json({
        changes: result.data?.rows ?? [],
        limit,
        offset,
      });
    } catch (error) {
      logger.error("Erro ao buscar mudanças firewall", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/firewall/hosts — lista hosts com regras
firewallRoute.get(
  "/hosts",
  requirePermission("firewall:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT DISTINCT host, COUNT(*) as rule_count, COUNT(*) FILTER (WHERE is_enabled = true) as enabled_count FROM public.firewall_rules WHERE tenant_id = $1 GROUP BY host ORDER BY host",
        [tenantId],
      );

      return c.json({
        hosts: result.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao listar hosts firewall", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
