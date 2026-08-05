// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import {
  finopsCostSchema,
  finopsOptimizationSchema,
  finopsOptimizationStatusSchema,
  finopsBudgetSchema,
} from "@repo/shared-validation";
import "../types.js";

export const finopsRoute = new Hono();

// GET /api/v1/finops — overview do modulo
finopsRoute.get("/", requirePermission("finops:read"), async (c) => {
  return c.json({
    overview: "FinOps — Financial Operations",
    endpoints: ["/costs", "/summary", "/optimizations", "/budgets", "/stats"],
  });
});

// ========== Cost Entries ==========

// GET /api/v1/finops/costs — lista custos com filtros
finopsRoute.get("/costs", requirePermission("finops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const category = c.req.query("category");
  const year = c.req.query("year");

  let sql = "SELECT * FROM public.cost_entries WHERE tenant_id = $1";
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (category) {
    sql += ` AND category = $${paramIdx++}`;
    params.push(category);
  }
  if (year) {
    sql += ` AND EXTRACT(YEAR FROM period_start) = $${paramIdx++}`;
    params.push(parseInt(year, 10));
  }

  sql += ` ORDER BY period_start DESC, category LIMIT $${paramIdx++}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ costs: result.data?.rows ?? [] });
});

// POST /api/v1/finops/costs — registra custo
finopsRoute.post(
  "/costs",
  requirePermission("finops:write"),
  validate({ schema: finopsCostSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const body = c.get("validatedData") as {
      period_start: string;
      period_end: string;
      category: string;
      resource_name?: string;
      resource_type?: string;
      cost_amount: number;
      currency?: string;
      usage_quantity?: number;
      usage_unit?: string;
      source?: string;
    };
    const {
      period_start,
      period_end,
      category,
      resource_name,
      resource_type,
      cost_amount,
      currency,
      usage_quantity,
      usage_unit,
      source,
    } = body;

    const result = await query<{ id: string }>(
      `INSERT INTO public.cost_entries (tenant_id, period_start, period_end, category, resource_name, resource_type, cost_amount, currency, usage_quantity, usage_unit, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tenant_id, period_start, category, resource_name) DO UPDATE SET
       cost_amount = EXCLUDED.cost_amount,
       usage_quantity = EXCLUDED.usage_quantity,
       usage_unit = EXCLUDED.usage_unit
     RETURNING id`,
      [
        tenantId,
        period_start,
        period_end,
        category,
        resource_name ?? null,
        resource_type ?? null,
        cost_amount,
        currency ?? "BRL",
        usage_quantity ?? null,
        usage_unit ?? null,
        source ?? "manual",
      ],
    );

    return c.json({ id: result.data?.rows[0]?.id, created: true });
  },
);

// ========== Cost Summary ==========

// GET /api/v1/finops/summary — resumo de custos por mes/categoria
finopsRoute.get("/summary", requirePermission("finops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const year = c.req.query("year") ?? new Date().getFullYear().toString();

  const byMonthResult = await query(
    `SELECT EXTRACT(MONTH FROM period_start) as month,
       SUM(cost_amount) as total,
       COUNT(*) as entries
     FROM public.cost_entries
     WHERE tenant_id = $1 AND EXTRACT(YEAR FROM period_start) = $2
     GROUP BY EXTRACT(MONTH FROM period_start) ORDER BY month`,
    [tenantId, parseInt(year, 10)],
  );

  const byCategoryResult = await query(
    `SELECT category, SUM(cost_amount) as total
     FROM public.cost_entries
     WHERE tenant_id = $1 AND EXTRACT(YEAR FROM period_start) = $2
     GROUP BY category ORDER BY total DESC`,
    [tenantId, parseInt(year, 10)],
  );

  const totalResult = await query(
    "SELECT SUM(cost_amount) as total FROM public.cost_entries WHERE tenant_id = $1 AND EXTRACT(YEAR FROM period_start) = $2",
    [tenantId, parseInt(year, 10)],
  );

  const total = totalResult.data?.rows[0]?.total ?? "0";

  return c.json({
    year: parseInt(year, 10),
    total: total,
    by_month: byMonthResult.data?.rows ?? [],
    by_category: byCategoryResult.data?.rows ?? [],
  });
});

// ========== Optimizations ==========

// GET /api/v1/finops/optimizations — lista otimizacoes
finopsRoute.get(
  "/optimizations",
  requirePermission("finops:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const status = c.req.query("status");

    let sql = "SELECT * FROM public.cost_optimizations WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];

    if (status) {
      sql += " AND status = $2";
      params.push(status);
    }

    sql += " ORDER BY estimated_savings_annual DESC";

    const result = await query(sql, params);

    return c.json({ optimizations: result.data?.rows ?? [] });
  },
);

// POST /api/v1/finops/optimizations — cria otimizacao
finopsRoute.post(
  "/optimizations",
  requirePermission("finops:write"),
  validate({ schema: finopsOptimizationSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const body = c.get("validatedData") as {
      category: string;
      resource_name?: string;
      title: string;
      description?: string;
      estimated_savings_monthly: number;
      estimated_savings_annual?: number;
      currency?: string;
      effort?: string;
    };
    const {
      category,
      resource_name,
      title,
      description,
      estimated_savings_monthly,
      estimated_savings_annual,
      currency,
      effort,
    } = body;

    const result = await query<{ id: string }>(
      `INSERT INTO public.cost_optimizations (tenant_id, category, resource_name, title, description, estimated_savings_monthly, estimated_savings_annual, currency, effort, identified_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        tenantId,
        category,
        resource_name ?? null,
        title,
        description ?? null,
        estimated_savings_monthly,
        estimated_savings_annual ?? estimated_savings_monthly * 12,
        currency ?? "BRL",
        effort ?? "medium",
        user.sub,
      ],
    );

    await query(
      "SELECT public.write_audit_log($1, NULL, 'finops.optimization.create', 'cost_optimizations', NULL, $2, NULL, NULL)",
      [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, title })],
    );

    return c.json({ id: result.data?.rows[0]?.id, created: true });
  },
);

// PUT /api/v1/finops/optimizations/:id/status — atualiza status
finopsRoute.put(
  "/optimizations/:id/status",
  requirePermission("finops:write"),
  validate({ schema: finopsOptimizationStatusSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const optimizationId = c.req.param("id");
    const body = c.get("validatedData") as {
      status: string;
      actual_savings_monthly?: number;
    };
    const { status, actual_savings_monthly } = body;

    if (status === "implemented") {
      await query(
        "UPDATE public.cost_optimizations SET status = $1, implemented_at = timezone('utc'::text, now()), actual_savings_monthly = $2 WHERE id = $3 AND tenant_id = $4",
        [status, actual_savings_monthly ?? null, optimizationId, tenantId],
      );
    } else {
      await query(
        "UPDATE public.cost_optimizations SET status = $1 WHERE id = $2 AND tenant_id = $3",
        [status, optimizationId, tenantId],
      );
    }

    return c.json({ updated: true });
  },
);

// ========== Budgets ==========

// GET /api/v1/finops/budgets — lista orcamentos
finopsRoute.get("/budgets", requirePermission("finops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const year = c.req.query("year") ?? new Date().getFullYear().toString();

  const result = await query(
    "SELECT * FROM public.cost_budgets WHERE tenant_id = $1 AND year = $2 ORDER BY month, category",
    [tenantId, parseInt(year, 10)],
  );

  return c.json({ budgets: result.data?.rows ?? [] });
});

// PUT /api/v1/finops/budgets — cria ou atualiza orcamento
finopsRoute.put(
  "/budgets",
  requirePermission("finops:write"),
  validate({ schema: finopsBudgetSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const body = c.get("validatedData") as {
      month: number;
      year: number;
      category?: string;
      budget_amount: number;
      currency?: string;
      alert_threshold_pct?: number;
    };
    const {
      month,
      year,
      category,
      budget_amount,
      currency,
      alert_threshold_pct,
    } = body;

    const result = await query<{ id: string }>(
      `INSERT INTO public.cost_budgets (tenant_id, month, year, category, budget_amount, currency, alert_threshold_pct, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, year, month, category) DO UPDATE SET
       budget_amount = EXCLUDED.budget_amount,
       currency = EXCLUDED.currency,
       alert_threshold_pct = EXCLUDED.alert_threshold_pct
     RETURNING id`,
      [
        tenantId,
        month,
        year,
        category ?? null,
        budget_amount,
        currency ?? "BRL",
        alert_threshold_pct ?? 80,
        user.sub,
      ],
    );

    return c.json({ id: result.data?.rows[0]?.id, updated: true });
  },
);

// ========== Stats ==========

// GET /api/v1/finops/stats — estatisticas gerais
finopsRoute.get("/stats", requirePermission("finops:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const year = new Date().getFullYear();

  const totalCostResult = await query(
    "SELECT SUM(cost_amount) as total FROM public.cost_entries WHERE tenant_id = $1 AND EXTRACT(YEAR FROM period_start) = $2",
    [tenantId, year],
  );

  const totalSavingsResult = await query(
    "SELECT SUM(estimated_savings_annual) as total FROM public.cost_optimizations WHERE tenant_id = $1 AND status NOT IN ('rejected', 'identified')",
    [tenantId],
  );

  const implementedSavingsResult = await query(
    "SELECT SUM(actual_savings_monthly) as total FROM public.cost_optimizations WHERE tenant_id = $1 AND status = 'implemented' AND actual_savings_monthly IS NOT NULL",
    [tenantId],
  );

  const pendingOptimizationsResult = await query(
    "SELECT COUNT(*) as count FROM public.cost_optimizations WHERE tenant_id = $1 AND status IN ('identified', 'approved', 'in_progress')",
    [tenantId],
  );

  const budgetResult = await query(
    "SELECT SUM(budget_amount) as total FROM public.cost_budgets WHERE tenant_id = $1 AND year = $2",
    [tenantId, year],
  );

  const getValue = (r: {
    data?: { rows?: Array<Record<string, unknown>> } | null;
  }): string => {
    const row = r.data?.rows?.[0];
    return (row?.total as string) ?? "0";
  };

  const getCount = (r: {
    data?: { rows?: Array<Record<string, unknown>> } | null;
  }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    total_cost_year: getValue(totalCostResult),
    potential_savings_annual: getValue(totalSavingsResult),
    implemented_savings_monthly: getValue(implementedSavingsResult),
    pending_optimizations: getCount(pendingOptimizationsResult),
    total_budget_year: getValue(budgetResult),
  });
});
