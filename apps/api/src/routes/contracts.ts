// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { z } from "zod";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { safeJsonBody } from "../lib/safe-json.js";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const contractsRoute = new Hono();

// ========== Schemas ==========

const createContractSchema = z.object({
  name: z.string().min(1).max(255),
  contract_number: z.string().max(100).optional(),
  contract_type: z.enum([
    "monthly_support",
    "project_fixed",
    "project_lump_sum",
    "hour_bank",
    "on_demand",
  ]),
  contracted_hours: z.number().int().min(0).default(0),
  period_type: z
    .enum(["monthly", "quarterly", "yearly", "total"])
    .default("monthly"),
  billing_day: z.number().int().min(1).max(28).default(1),
  carry_over_rule: z
    .enum(["none", "unlimited", "limited", "expire"])
    .default("none"),
  carry_over_limit_hours: z.number().int().min(0).optional(),
  carry_over_expire_days: z.number().int().min(1).optional(),
  overtime_enabled: z.boolean().default(false),
  overtime_rate: z.number().positive().optional(),
  rate_diagnosis: z.number().positive().optional(),
  rate_fix: z.number().positive().optional(),
  rate_monitoring: z.number().positive().optional(),
  rate_meeting: z.number().positive().optional(),
  rate_research: z.number().positive().optional(),
  rate_default: z.number().positive().optional(),
  start_date: z.string().min(1),
  end_date: z.string().optional(),
  auto_close_tickets_on_expire: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
});

const updateContractSchema = createContractSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const createWorkLogSchema = z.object({
  ticket_id: z.string().uuid(),
  contract_id: z.string().uuid().optional(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  minutes_worked: z.number().int().min(1),
  pause_minutes: z.number().int().min(0).default(0),
  pause_reason: z.string().max(500).optional(),
  description: z.string().min(1).max(5000),
  work_type: z.enum([
    "diagnosis",
    "fix",
    "monitoring",
    "meeting",
    "research",
    "travel",
    "other",
  ]),
  billable: z.boolean().default(true),
  rate_applied: z.number().positive().optional(),
});

const updateWorkLogSchema = createWorkLogSchema.partial();

const startWorkLogSchema = z.object({
  ticket_id: z.string().uuid(),
  contract_id: z.string().uuid().optional(),
  description: z.string().min(1).max(5000),
  work_type: z.enum([
    "diagnosis",
    "fix",
    "monitoring",
    "meeting",
    "research",
    "travel",
    "other",
  ]),
  billable: z.boolean().default(true),
});

const finishWorkLogSchema = z.object({
  adjusted_minutes: z.number().int().min(1).optional(),
  description: z.string().max(5000).optional(),
  billable: z.boolean().optional(),
});

// Helper: verifica se contrato pertence ao tenant (protecao IDOR)
async function verifyContractOwnership(
  contractId: string,
  tenantId: string | null,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    "SELECT id FROM public.tenant_contracts WHERE id = $1 AND tenant_id = $2",
    [contractId, tenantId],
  );
  return !!result.data?.rows[0];
}

// Helper: verifica se ticket pertence ao tenant (protecao IDOR)
async function verifyTicketOwnership(
  ticketId: string,
  tenantId: string | null,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    "SELECT id FROM public.tickets WHERE id = $1 AND tenant_id = $2",
    [ticketId, tenantId],
  );
  return !!result.data?.rows[0];
}

// ========== Contracts CRUD ==========

// GET /api/v1/contracts — lista contratos do tenant (otimizado, sem N+1)
contractsRoute.get(
  "/",
  httpCache(30),
  requirePermission("tickets:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const activeOnly = c.req.query("active") === "true";

    // Otimizado: LATERAL JOIN em vez de 2 subqueries correlacionadas por linha
    let sql = `
      SELECT tc.*,
        wlm.used_hours_current_month,
        wlm.total_work_logs
      FROM public.tenant_contracts tc
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(minutes_worked) FILTER (WHERE billable = true
            AND started_at >= DATE_TRUNC('month', now())) / 60.0, 0) as used_hours_current_month,
          COUNT(*) as total_work_logs
        FROM public.ticket_work_logs
        WHERE contract_id = tc.id
      ) wlm ON true
      WHERE tc.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    if (activeOnly) {
      sql += ` AND tc.is_active = true`;
    }
    sql += ` ORDER BY tc.created_at DESC`;

    try {
      const result = await query(sql, params);
      if (result.error) {
        logger.error("Erro ao listar contratos", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar contratos" },
          },
          500,
        );
      }
      return c.json({ contracts: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar contratos", {
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

// GET /api/v1/contracts/:id — detalhe
contractsRoute.get("/:id", requirePermission("tickets:read"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const result = await query(
      `SELECT * FROM public.tenant_contracts WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
        404,
      );
    }

    return c.json({ contract: result.data.rows[0] });
  } catch (error) {
    logger.error("Erro ao buscar detalhe do contrato", {
      contractId: id,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro ao carregar contrato" },
      },
      500,
    );
  }
});

// POST /api/v1/contracts — criar
contractsRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createContractSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;
    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.tenant_contracts
          (tenant_id, contract_number, name, contract_type, contracted_hours,
           period_type, billing_day, carry_over_rule, carry_over_limit_hours,
           carry_over_expire_days, overtime_enabled, overtime_rate,
           rate_diagnosis, rate_fix, rate_monitoring, rate_meeting, rate_research,
           rate_default, start_date, end_date, auto_close_tickets_on_expire, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::date,$20::date,$21,$22)
         RETURNING id`,
        [
          tenantId,
          d.contract_number ?? null,
          d.name,
          d.contract_type,
          d.contracted_hours,
          d.period_type,
          d.billing_day,
          d.carry_over_rule,
          d.carry_over_limit_hours ?? null,
          d.carry_over_expire_days ?? null,
          d.overtime_enabled,
          d.overtime_rate ?? null,
          d.rate_diagnosis ?? null,
          d.rate_fix ?? null,
          d.rate_monitoring ?? null,
          d.rate_meeting ?? null,
          d.rate_research ?? null,
          d.rate_default ?? null,
          d.start_date,
          d.end_date ?? null,
          d.auto_close_tickets_on_expire,
          d.notes ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar contrato", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar contrato" },
          },
          500,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'contract.create', 'tenant_contract', $2, $3, NULL, NULL)",
          [user.sub, result.data.rows[0].id, JSON.stringify({ name: d.name })],
        );
      }

      logger.info("Contrato criado", {
        contractId: result.data.rows[0].id,
        tenantId,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar contrato", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar contrato" } },
        500,
      );
    }
  },
);

// PUT /api/v1/contracts/:id — atualizar
contractsRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateContractSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      contract_number: "contract_number",
      contract_type: "contract_type",
      contracted_hours: "contracted_hours",
      period_type: "period_type",
      billing_day: "billing_day",
      carry_over_rule: "carry_over_rule",
      carry_over_limit_hours: "carry_over_limit_hours",
      carry_over_expire_days: "carry_over_expire_days",
      overtime_enabled: "overtime_enabled",
      overtime_rate: "overtime_rate",
      rate_diagnosis: "rate_diagnosis",
      rate_fix: "rate_fix",
      rate_monitoring: "rate_monitoring",
      rate_meeting: "rate_meeting",
      rate_research: "rate_research",
      rate_default: "rate_default",
      start_date: "start_date",
      end_date: "end_date",
      auto_close_tickets_on_expire: "auto_close_tickets_on_expire",
      notes: "notes",
      is_active: "is_active",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in d) {
        const val = d[key as keyof typeof d];
        if (key === "start_date" || key === "end_date") {
          fields.push(`${col} = $${idx++}::date`);
        } else {
          fields.push(`${col} = $${idx++}`);
        }
        params.push(val);
      }
    }

    if (fields.length === 0) {
      return c.json(
        {
          error: { code: "NO_FIELDS", message: "Nenhum campo para atualizar" },
        },
        400,
      );
    }

    params.push(id, tenantId);
    try {
      const result = await query(
        `UPDATE public.tenant_contracts SET ${fields.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'contract.update', 'tenant_contract', $2, $3, NULL, NULL)",
          [user.sub, id, JSON.stringify(d)],
        );
      }

      return c.json({ id, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar contrato", {
        contractId: id,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar contrato",
          },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/contracts/:id — desativar (soft delete)
contractsRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `UPDATE public.tenant_contracts SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'contract.deactivate', 'tenant_contract', $2, NULL, NULL, NULL)",
          [user.sub, id],
        );
      }

      return c.json({ id, deactivated: true });
    } catch (error) {
      logger.error("Erro ao desativar contrato", {
        contractId: id,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "DELETE_ERROR",
            message: "Erro ao desativar contrato",
          },
        },
        500,
      );
    }
  },
);

// ========== Hour Bank ==========

// GET /api/v1/contracts/:id/hour-bank — resumo do hour bank
contractsRoute.get(
  "/:id/hour-bank",
  requirePermission("tickets:read"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Protecao IDOR: verifica ownership antes de chamar a stored procedure
      const owned = await verifyContractOwnership(id, tenantId);
      if (!owned) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      const result = await query(
        "SELECT * FROM public.get_hour_bank_summary($1)",
        [id],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      return c.json({ summary: result.data.rows[0] });
    } catch (error) {
      logger.error("Erro ao buscar hour-bank", {
        contractId: id,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao carregar hour bank",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/contracts/:id/hour-bank/periods — historico de fechamentos
contractsRoute.get(
  "/:id/hour-bank/periods",
  requirePermission("tickets:read"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Protecao IDOR: verifica ownership
      const owned = await verifyContractOwnership(id, tenantId);
      if (!owned) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      const result = await query(
        `SELECT hbp.* FROM public.hour_bank_periods hbp
         JOIN public.tenant_contracts tc ON hbp.contract_id = tc.id
         WHERE hbp.contract_id = $1 AND tc.tenant_id = $2
         ORDER BY hbp.period_end DESC LIMIT 24`,
        [id, tenantId],
      );

      if (result.error) {
        logger.error("Erro ao listar periodos hour-bank", {
          contractId: id,
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar períodos" },
          },
          500,
        );
      }

      return c.json({ periods: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar periodos hour-bank", {
        contractId: id,
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

// POST /api/v1/contracts/:id/hour-bank/close — fechar periodo
contractsRoute.post(
  "/:id/hour-bank/close",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const closeSchema = z.object({
      period_end: z.string().min(1),
    });
    const parsed = closeSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "period_end obrigatório",
          },
        },
        400,
      );
    }

    try {
      // Protecao IDOR: verifica ownership
      const owned = await verifyContractOwnership(id, tenantId);
      if (!owned) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contrato não encontrado" } },
          404,
        );
      }

      const result = await query(
        "SELECT * FROM public.close_hour_bank_period($1, $2::date)",
        [id, parsed.data.period_end],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao fechar periodo hour-bank", {
          contractId: id,
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CLOSE_ERROR", message: "Erro ao fechar período" } },
          500,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'contract.hour_bank.close', 'hour_bank_period', $2, $3, NULL, NULL)",
          [
            user.sub,
            result.data.rows[0].id,
            JSON.stringify({
              contract_id: id,
              period_end: parsed.data.period_end,
            }),
          ],
        );
      }

      logger.info("Periodo hour-bank fechado", {
        contractId: id,
        periodId: result.data.rows[0].id,
        tenantId,
      });

      return c.json({ period: result.data.rows[0] });
    } catch (error) {
      logger.error("Erro inesperado ao fechar periodo hour-bank", {
        contractId: id,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CLOSE_ERROR", message: "Erro ao fechar período" } },
        500,
      );
    }
  },
);

// ========== Work Logs ==========

// GET /api/v1/contracts/:id/work-logs — lista work logs do contrato
contractsRoute.get(
  "/:id/work-logs",
  requirePermission("tickets:read"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
      // Protecao IDOR: filtra por tenant_id via JOIN
      const result = await query(
        `SELECT wl.*, t.ticket_number, t.subject as ticket_subject
         FROM public.ticket_work_logs wl
         JOIN public.tenant_contracts tc ON wl.contract_id = tc.id
         LEFT JOIN public.tickets t ON wl.ticket_id = t.id
         WHERE wl.contract_id = $1 AND tc.tenant_id = $2
         ORDER BY wl.started_at DESC
         LIMIT $3 OFFSET $4`,
        [id, tenantId, limit, offset],
      );

      if (result.error) {
        logger.error("Erro ao listar work-logs do contrato", {
          contractId: id,
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar work logs" },
          },
          500,
        );
      }

      return c.json({ work_logs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar work-logs do contrato", {
        contractId: id,
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

// POST /api/v1/contracts/work-logs — criar work log (nao vinculado a contrato na URL)
contractsRoute.post(
  "/work-logs",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createWorkLogSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;

    try {
      // Protecao IDOR: verifica se ticket pertence ao tenant
      const ticketOwned = await verifyTicketOwnership(d.ticket_id, tenantId);
      if (!ticketOwned) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Ticket não encontrado para este tenant",
            },
          },
          404,
        );
      }

      // Se contract_id nao fornecido, busca contrato ativo do tenant
      let contractId: string | null = d.contract_id ?? null;
      if (!contractId) {
        const activeContract = await query<{ id: string }>(
          `SELECT id FROM public.tenant_contracts WHERE tenant_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
          [tenantId],
        );
        contractId = activeContract.data?.rows[0]?.id ?? null;
      } else {
        // Protecao IDOR: se contract_id fornecido, verifica ownership
        const contractOwned = await verifyContractOwnership(
          contractId,
          tenantId,
        );
        if (!contractOwned) {
          return c.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "Contrato não encontrado para este tenant",
              },
            },
            404,
          );
        }
      }

      // Calcula rate_applied e amount baseado no contrato
      let rateApplied = d.rate_applied ?? null;
      let amount = 0;
      if (contractId) {
        const contractResult = await query(
          "SELECT rate_diagnosis, rate_fix, rate_monitoring, rate_meeting, rate_research, rate_default FROM public.tenant_contracts WHERE id = $1",
          [contractId],
        );
        const contract = contractResult.data?.rows[0];
        if (contract && !rateApplied) {
          const rateMap: Record<string, string> = {
            diagnosis: "rate_diagnosis",
            fix: "rate_fix",
            monitoring: "rate_monitoring",
            meeting: "rate_meeting",
            research: "rate_research",
          };
          const rateField = rateMap[d.work_type];
          rateApplied = rateField
            ? (contract[rateField] as number)
            : (contract.rate_default as number);
        }
      }
      if (rateApplied) {
        amount = (d.minutes_worked / 60) * rateApplied;
      }

      const result = await query<{ id: string }>(
        `INSERT INTO public.ticket_work_logs
          (tenant_id, ticket_id, contract_id, user_id, user_name,
           started_at, ended_at, minutes_worked, pause_minutes, pause_reason,
           description, work_type, billable, rate_applied, amount)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          tenantId,
          d.ticket_id,
          contractId,
          user?.sub ?? null,
          user?.sub ?? "Sistema",
          d.started_at,
          d.ended_at ?? null,
          d.minutes_worked,
          d.pause_minutes,
          d.pause_reason ?? null,
          d.description,
          d.work_type,
          d.billable,
          rateApplied,
          amount,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar work log", {
          tenantId,
          ticketId: d.ticket_id,
          error: result.error?.message,
        });
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar work log" },
          },
          500,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'work_log.create', 'ticket_work_log', $2, $3, NULL, NULL)",
          [
            user.sub,
            result.data.rows[0].id,
            JSON.stringify({
              ticket_id: d.ticket_id,
              minutes: d.minutes_worked,
              work_type: d.work_type,
            }),
          ],
        );
      }

      logger.info("Work log criado", {
        workLogId: result.data.rows[0].id,
        tenantId,
        ticketId: d.ticket_id,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar work log", {
        tenantId,
        ticketId: d.ticket_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar work log" } },
        500,
      );
    }
  },
);

// PUT /api/v1/contracts/work-logs/:logId — atualizar work log
contractsRoute.put(
  "/work-logs/:logId",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const logId = c.req.param("logId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateWorkLogSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      ticket_id: "ticket_id",
      contract_id: "contract_id",
      started_at: "started_at",
      ended_at: "ended_at",
      minutes_worked: "minutes_worked",
      pause_minutes: "pause_minutes",
      pause_reason: "pause_reason",
      description: "description",
      work_type: "work_type",
      billable: "billable",
      rate_applied: "rate_applied",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in d) {
        const val = d[key as keyof typeof d];
        if (key === "started_at" || key === "ended_at") {
          fields.push(`${col} = $${idx++}::timestamptz`);
        } else {
          fields.push(`${col} = $${idx++}`);
        }
        params.push(val);
      }
    }

    // Recalcula amount se minutes_worked ou rate mudou
    if ("minutes_worked" in d || "rate_applied" in d) {
      fields.push(
        `amount = ($${idx}::numeric / 60.0) * COALESCE($${idx + 1}::numeric, rate_applied, 0)`,
      );
      params.push(d.minutes_worked ?? 0, d.rate_applied ?? null);
      idx += 2;
    }

    if (fields.length === 0) {
      return c.json(
        {
          error: { code: "NO_FIELDS", message: "Nenhum campo para atualizar" },
        },
        400,
      );
    }

    params.push(logId, tenantId);
    try {
      const result = await query(
        `UPDATE public.ticket_work_logs SET ${fields.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Work log não encontrado" } },
          404,
        );
      }

      return c.json({ id: logId, updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar work log", {
        logId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar work log",
          },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/contracts/work-logs/:logId — remover work log
contractsRoute.delete(
  "/work-logs/:logId",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const logId = c.req.param("logId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `DELETE FROM public.ticket_work_logs WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [logId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Work log não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'work_log.delete', 'ticket_work_log', $2, NULL, NULL, NULL)",
          [user.sub, logId],
        );
      }

      return c.json({ id: logId, deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar work log", {
        logId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "DELETE_ERROR", message: "Erro ao excluir work log" },
        },
        500,
      );
    }
  },
);

// GET /api/v1/contracts/tickets/:ticketId/work-logs — work logs de um ticket
contractsRoute.get(
  "/tickets/:ticketId/work-logs",
  requirePermission("tickets:read"),
  async (c) => {
    const ticketId = c.req.param("ticketId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Protecao IDOR: filtra por tenant_id via JOIN com tickets
      const result = await query(
        `SELECT wl.*, u.email as user_email
         FROM public.ticket_work_logs wl
         JOIN public.tickets t ON wl.ticket_id = t.id
         LEFT JOIN public.users u ON wl.user_id = u.id
         WHERE wl.ticket_id = $1 AND t.tenant_id = $2
         ORDER BY wl.started_at DESC`,
        [ticketId, tenantId],
      );

      if (result.error) {
        logger.error("Erro ao listar work-logs do ticket", {
          ticketId,
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar work logs" },
          },
          500,
        );
      }

      return c.json({ work_logs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar work-logs do ticket", {
        ticketId,
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

// ===================================================================
// TIMER ENDPOINTS — iniciar/pausar/retomar/finalizar com revisao
// ===================================================================

// POST /api/v1/contracts/work-logs/start — inicia timer
contractsRoute.post(
  "/work-logs/start",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = startWorkLogSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;

    try {
      // Protecao IDOR: verifica se ticket pertence ao tenant
      const ticketOwned = await verifyTicketOwnership(d.ticket_id, tenantId);
      if (!ticketOwned) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Ticket não encontrado para este tenant",
            },
          },
          404,
        );
      }

      // Se contract_id nao fornecido, busca contrato ativo do tenant
      let contractId: string | null = d.contract_id ?? null;
      if (!contractId) {
        const activeContract = await query<{ id: string }>(
          `SELECT id FROM public.tenant_contracts WHERE tenant_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
          [tenantId],
        );
        contractId = activeContract.data?.rows[0]?.id ?? null;
      } else {
        // Protecao IDOR: se contract_id fornecido, verifica ownership
        const contractOwned = await verifyContractOwnership(
          contractId,
          tenantId,
        );
        if (!contractOwned) {
          return c.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "Contrato não encontrado para este tenant",
              },
            },
            404,
          );
        }
      }

      const result = await query<{ id: string; started_at: string }>(
        `INSERT INTO public.ticket_work_logs
          (tenant_id, ticket_id, contract_id, user_id, user_name,
           started_at, minutes_worked, pause_minutes,
           description, work_type, billable,
           status, total_seconds)
         VALUES ($1, $2, $3, $4, $5, now(), 0, 0, $6, $7, $8, 'running', 0)
         RETURNING id, started_at`,
        [
          tenantId,
          d.ticket_id,
          contractId,
          user?.sub ?? null,
          user?.sub ?? "Sistema",
          d.description,
          d.work_type,
          d.billable,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao iniciar work log timer", {
          tenantId,
          ticketId: d.ticket_id,
          error: result.error?.message,
        });
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao iniciar work log",
            },
          },
          500,
        );
      }

      return c.json(
        {
          id: result.data.rows[0].id,
          started_at: result.data.rows[0].started_at,
          status: "running",
        },
        201,
      );
    } catch (error) {
      logger.error("Erro inesperado ao iniciar work log timer", {
        tenantId,
        ticketId: d.ticket_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao iniciar work log" },
        },
        500,
      );
    }
  },
);

// POST /api/v1/contracts/work-logs/:logId/pause — pausa timer (retorna tempo para revisao)
contractsRoute.post(
  "/work-logs/:logId/pause",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const logId = c.req.param("logId");
    const user = c.get("user");

    try {
      const result = await query<{
        id: string;
        elapsed_seconds: number;
        total_seconds: number;
        started_at: string;
        last_resumed_at: string | null;
      }>("SELECT * FROM public.pause_work_log($1, $2)", [
        logId,
        user?.sub ?? null,
      ]);

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "PAUSE_ERROR", message: "Erro ao pausar work log" },
          },
          500,
        );
      }

      const r = result.data.rows[0];
      return c.json({
        id: r.id,
        elapsed_seconds: r.elapsed_seconds,
        total_seconds: r.total_seconds,
        total_minutes: Math.floor(r.total_seconds / 60),
        started_at: r.started_at,
        last_resumed_at: r.last_resumed_at,
        status: "paused",
      });
    } catch (err) {
      logger.error("Erro ao pausar work log", {
        logId,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        { error: { code: "PAUSE_ERROR", message: "Erro ao pausar work log" } },
        400,
      );
    }
  },
);

// POST /api/v1/contracts/work-logs/:logId/resume — retoma timer pausado
contractsRoute.post(
  "/work-logs/:logId/resume",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const logId = c.req.param("logId");
    const user = c.get("user");

    try {
      const result = await query<{
        id: string;
        total_seconds: number;
        status: string;
      }>("SELECT * FROM public.resume_work_log($1, $2)", [
        logId,
        user?.sub ?? null,
      ]);

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "RESUME_ERROR",
              message: "Erro ao retomar work log",
            },
          },
          500,
        );
      }

      return c.json({
        id: result.data.rows[0].id,
        total_seconds: result.data.rows[0].total_seconds,
        status: "running",
      });
    } catch (err) {
      logger.error("Erro ao retomar work log", {
        logId,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        {
          error: { code: "RESUME_ERROR", message: "Erro ao retomar work log" },
        },
        400,
      );
    }
  },
);

// POST /api/v1/contracts/work-logs/:logId/finish — finaliza timer com revisao manual
contractsRoute.post(
  "/work-logs/:logId/finish",
  rateLimitWrite,
  requirePermission("tickets:write"),
  async (c) => {
    const logId = c.req.param("logId");
    const user = c.get("user");
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = finishWorkLogSchema.safeParse(bodyResult.data ?? {});
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const d = parsed.data;

    try {
      const result = await query<{
        id: string;
        elapsed_seconds: number;
        total_seconds: number;
        total_minutes: number;
        started_at: string;
        ended_at: string;
        status: string;
      }>("SELECT * FROM public.finish_work_log($1, $2, $3)", [
        logId,
        user?.sub ?? null,
        d.adjusted_minutes ?? null,
      ]);

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "FINISH_ERROR",
              message: "Erro ao finalizar work log",
            },
          },
          500,
        );
      }

      const r = result.data.rows[0];

      // Se description ou billable foram atualizados, aplica
      if (d.description || d.billable !== undefined) {
        const updates: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        if (d.description) {
          updates.push(`description = $${idx++}`);
          params.push(d.description);
        }
        if (d.billable !== undefined) {
          updates.push(`billable = $${idx++}`);
          params.push(d.billable);
        }
        params.push(logId);
        await query(
          `UPDATE public.ticket_work_logs SET ${updates.join(", ")} WHERE id = $${idx}`,
          params,
        );
      }

      // Recalcula amount baseado no contrato (paralelizado com audit log)
      const logResult = await query<{
        contract_id: string | null;
        work_type: string;
        minutes_worked: number;
      }>(
        "SELECT contract_id, work_type, minutes_worked FROM public.ticket_work_logs WHERE id = $1",
        [logId],
      );
      const logRow = logResult.data?.rows[0];

      const auditPromise = user?.sub
        ? query(
            "SELECT public.write_audit_log($1, NULL, 'work_log.finish', 'ticket_work_log', $2, $3, NULL, NULL)",
            [
              user.sub,
              logId,
              JSON.stringify({
                total_minutes: r.total_minutes,
                adjusted: !!d.adjusted_minutes,
              }),
            ],
          )
        : Promise.resolve();

      if (logRow?.contract_id) {
        const contractResult = await query(
          "SELECT rate_diagnosis, rate_fix, rate_monitoring, rate_meeting, rate_research, rate_default FROM public.tenant_contracts WHERE id = $1",
          [logRow.contract_id],
        );
        const contract = contractResult.data?.rows[0];
        if (contract) {
          const rateMap: Record<string, string> = {
            diagnosis: "rate_diagnosis",
            fix: "rate_fix",
            monitoring: "rate_monitoring",
            meeting: "rate_meeting",
            research: "rate_research",
          };
          const rateField = rateMap[logRow.work_type];
          const rate = rateField
            ? (contract[rateField] as number)
            : (contract.rate_default as number);
          if (rate) {
            const amount = (logRow.minutes_worked / 60) * rate;
            await query(
              "UPDATE public.ticket_work_logs SET rate_applied = $1, amount = $2 WHERE id = $3",
              [rate, amount, logId],
            );
          }
        }
      }

      await auditPromise;

      logger.info("Work log finalizado", {
        logId,
        totalMinutes: r.total_minutes,
        adjusted: !!d.adjusted_minutes,
      });

      return c.json({
        id: r.id,
        elapsed_seconds: r.elapsed_seconds,
        total_seconds: r.total_seconds,
        total_minutes: r.total_minutes,
        started_at: r.started_at,
        ended_at: r.ended_at,
        status: "finished",
      });
    } catch (err) {
      logger.error("Erro ao finalizar work log", {
        logId,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        {
          error: {
            code: "FINISH_ERROR",
            message: "Erro ao finalizar work log",
          },
        },
        400,
      );
    }
  },
);

// GET /api/v1/contracts/work-logs/active — busca timer em andamento do usuario
contractsRoute.get(
  "/work-logs/active",
  requirePermission("tickets:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT wl.*, t.ticket_number, t.subject as ticket_subject
         FROM public.ticket_work_logs wl
         LEFT JOIN public.tickets t ON wl.ticket_id = t.id
         WHERE wl.user_id = $1 AND wl.tenant_id = $2 AND wl.status IN ('running', 'paused')
         ORDER BY wl.started_at DESC`,
        [user?.sub, tenantId],
      );

      if (result.error) {
        logger.error("Erro ao buscar timers ativos", {
          tenantId,
          userId: user?.sub,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar timers" } },
          500,
        );
      }

      return c.json({ active_timers: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao buscar timers ativos", {
        tenantId,
        userId: user?.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
