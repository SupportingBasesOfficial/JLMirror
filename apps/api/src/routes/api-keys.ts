// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { randomBytes, createHash } from "node:crypto";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createApiKeySchema,
  updateApiKeySchema,
  type CreateApiKeyInput,
  type UpdateApiKeyInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const apiKeyRoute = new Hono();

function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const rawBytes = randomBytes(32);
  const rawKey = `jl_${rawBytes.toString("hex")}`;
  const keyPrefix = rawKey.substring(0, 12);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyPrefix, keyHash };
}

// ========== List ==========

apiKeyRoute.get(
  "/",
  requirePermission("api_keys:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const activeOnly = c.req.query("active") === "true";

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    if (activeOnly) {
      conditions.push("is_active = true");
    }

    try {
      const result = await query(
        `SELECT id, name, description, key_prefix, scopes, allowed_ips,
           rate_limit_per_min, rate_limit_per_hour, rate_limit_per_day,
           is_active, expires_at, last_used_at, last_used_ip,
           total_requests, requests_today, requests_this_hour, requests_this_minute,
           rotated_from, rotated_at, created_at, updated_at
         FROM public.api_keys WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
        params,
      );

      return c.json({ keys: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar API keys", {
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

// ========== Create ==========

apiKeyRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("api_keys:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createApiKeySchema.safeParse(parsedBody.data);
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

    const data = parsed.data as CreateApiKeyInput;
    const { rawKey, keyPrefix, keyHash } = generateApiKey();

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.api_keys (tenant_id, name, description, key_prefix, key_hash, scopes, allowed_ips,
           rate_limit_per_min, rate_limit_per_hour, rate_limit_per_day, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          keyPrefix,
          keyHash,
          JSON.stringify(data.scopes),
          data.allowed_ips ? JSON.stringify(data.allowed_ips) : null,
          data.rate_limit_per_min ?? null,
          data.rate_limit_per_hour ?? null,
          data.rate_limit_per_day ?? null,
          data.expires_at ?? null,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar API key" } },
          500,
        );
      }

      const keyId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "api_key.create",
            entityType: "api_key",
            entityId: keyId,
            newData: { name: data.name, key_prefix: keyPrefix },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("API key criada", { keyId, name: data.name, tenantId });

      return c.json({ id: keyId, key: rawKey, key_prefix: keyPrefix }, 201);
    } catch (error) {
      logger.error("Erro ao criar API key", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar API key" } },
        500,
      );
    }
  },
);

// ========== Update ==========

apiKeyRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("api_keys:write"),
  async (c) => {
    const keyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateApiKeySchema.safeParse(parsedBody.data);
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

    const data = parsed.data as UpdateApiKeyInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      rate_limit_per_min: "rate_limit_per_min",
      rate_limit_per_hour: "rate_limit_per_hour",
      rate_limit_per_day: "rate_limit_per_day",
      is_active: "is_active",
      expires_at: "expires_at",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.scopes !== undefined) {
      updateFields.push(`scopes = $${paramIdx++}`);
      params.push(JSON.stringify(data.scopes));
    }

    if (data.allowed_ips !== undefined) {
      updateFields.push(`allowed_ips = $${paramIdx++}`);
      params.push(JSON.stringify(data.allowed_ips));
    }

    if (updateFields.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    params.push(keyId, tenantId);

    try {
      const result = await query(
        `UPDATE public.api_keys SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "API key não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "api_key.update",
            entityType: "api_key",
            entityId: keyId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("API key atualizada", { keyId, tenantId });

      return c.json({ id: keyId });
    } catch (error) {
      logger.error("Erro ao atualizar API key", {
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar API key" },
        },
        500,
      );
    }
  },
);

// ========== Delete ==========

apiKeyRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("api_keys:write"),
  async (c) => {
    const keyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.api_keys WHERE id = $1 AND tenant_id = $2",
        [keyId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "API key não encontrada" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "api_key.delete",
            entityType: "api_key",
            entityId: keyId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("API key removida", { keyId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover API key", {
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover API key" } },
        500,
      );
    }
  },
);

// ========== Rotate ==========

apiKeyRoute.post(
  "/:id/rotate",
  rateLimitWrite,
  requirePermission("api_keys:write"),
  async (c) => {
    const keyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const existingResult = await query(
        "SELECT * FROM public.api_keys WHERE id = $1 AND tenant_id = $2",
        [keyId, tenantId],
      );

      if (existingResult.error || !existingResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "API key não encontrada" } },
          404,
        );
      }

      const existing = existingResult.data.rows[0] as {
        name: string;
        description: string | null;
        scopes: string[];
        allowed_ips: string[];
        rate_limit_per_min: number;
        rate_limit_per_hour: number;
        rate_limit_per_day: number;
        expires_at: string | null;
      };

      const { rawKey, keyPrefix, keyHash } = generateApiKey();

      const result = await query<{ id: string }>(
        `INSERT INTO public.api_keys (tenant_id, name, description, key_prefix, key_hash, scopes, allowed_ips,
         rate_limit_per_min, rate_limit_per_hour, rate_limit_per_day, expires_at, created_by, rotated_from, rotated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, timezone('utc'::text, now()))
       RETURNING id`,
        [
          tenantId,
          existing.name,
          existing.description,
          keyPrefix,
          keyHash,
          JSON.stringify(existing.scopes),
          JSON.stringify(existing.allowed_ips),
          existing.rate_limit_per_min,
          existing.rate_limit_per_hour,
          existing.rate_limit_per_day,
          existing.expires_at,
          user?.sub ?? null,
          keyId,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao rotacionar API key",
            },
          },
          500,
        );
      }

      const newKeyId = result.data.rows[0].id;

      // Desativa a chave antiga
      await query(
        "UPDATE public.api_keys SET is_active = false WHERE id = $1",
        [keyId],
      );

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "api_key.rotate",
            entityType: "api_key",
            entityId: newKeyId,
            newData: { rotated_from: keyId, key_prefix: keyPrefix },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("API key rotacionada", {
        oldKeyId: keyId,
        newKeyId,
        tenantId,
      });

      return c.json(
        {
          id: newKeyId,
          key: rawKey,
          key_prefix: keyPrefix,
          rotated_from: keyId,
        },
        201,
      );
    } catch (error) {
      logger.error("Erro ao rotacionar API key", {
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "ROTATE_ERROR",
            message: "Erro ao rotacionar API key",
          },
        },
        500,
      );
    }
  },
);

// ========== Stats ==========

apiKeyRoute.get(
  "/stats",
  requirePermission("api_keys:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries independentes
      const [overviewResult, topKeys, recentUsage] = await Promise.all([
        query(
          `SELECT
             COUNT(*) as total_keys,
             COUNT(*) FILTER (WHERE is_active = true) as active_keys,
             COUNT(*) FILTER (WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < timezone('utc'::text, now())) as expired,
             COUNT(*) FILTER (WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < timezone('utc'::text, now()) + INTERVAL '7 days') as expiring_soon,
             SUM(total_requests) as total_requests,
             SUM(requests_today) as requests_today
           FROM public.api_keys WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT id, name, key_prefix, total_requests, requests_today, last_used_at, is_active
           FROM public.api_keys WHERE tenant_id = $1
           ORDER BY total_requests DESC LIMIT 5`,
          [tenantId],
        ),
        query(
          `SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as requests
           FROM public.api_key_usage_log
           WHERE tenant_id = $1 AND created_at > timezone('utc'::text, now()) - INTERVAL '7 days'
           GROUP BY day ORDER BY day DESC`,
          [tenantId],
        ),
      ]);

      return c.json({
        overview: overviewResult.data?.rows[0] ?? {
          total_keys: "0",
          active_keys: "0",
          expired: "0",
          expiring_soon: "0",
          total_requests: "0",
          requests_today: "0",
        },
        top_keys: topKeys.data?.rows ?? [],
        recent_usage: recentUsage.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats API keys", {
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

// ========== Usage Log ==========

apiKeyRoute.get(
  "/:id/usage",
  requirePermission("api_keys:read"),
  httpCache(15),
  async (c) => {
    const keyId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    try {
      const result = await query(
        `SELECT * FROM public.api_key_usage_log
         WHERE api_key_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [keyId, tenantId, limit],
      );

      return c.json({ usage: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao buscar usage API key", {
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
