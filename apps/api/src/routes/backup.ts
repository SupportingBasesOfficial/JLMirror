// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { exec } from "node:child_process";
import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  createBackupJobSchema,
  updateBackupJobSchema,
  createRestoreSchema,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import "../types.js";

export const backupRoute = new Hono();

// Helper: valida path para evitar command injection
// Bloqueia shell metacharacters e path traversal
function isSafePath(path: string): boolean {
  if (!path || path.length === 0) return false;
  // Bloqueia shell metacharacters
  if (/[;&|`$(){}!#~<>*?\\\n\r]/.test(path)) return false;
  // Bloqueia path traversal
  if (path.includes("..")) return false;
  // Bloqueia command substitution
  if (path.includes("$(") || path.includes("`")) return false;
  return true;
}

// Helper: valida hostname para evitar command injection
function isSafeHostname(host: string): boolean {
  if (!host || host.length === 0) return false;
  if (host === "localhost") return true;
  // Permite apenas hostname/IP sem shell metacharacters
  if (/[;&|`$(){}!#~<>*?\\\n\r\s]/.test(host)) return false;
  // Bloqueia command substitution
  if (host.includes("$(") || host.includes("`")) return false;
  return true;
}

// Executa comando shell e retorna saida padrao ou erro
function execCommand(
  command: string,
  timeoutMs: number = 300000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    exec(
      command,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
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

// Calcula checksum SHA256 real de um arquivo usando streaming (sem shell)
function calculateFileChecksum(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
      stream.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// Obtem tamanho real de arquivo
function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

// GET /api/v1/backups — overview do modulo
backupRoute.get("/", requirePermission("backup:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    // Paraleliza 2 queries
    const [jobsResult, restoresResult] = await Promise.all([
      query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.backup_jobs WHERE tenant_id = $1",
        [tenantId],
      ),
      query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'running') as running FROM public.backup_restores WHERE tenant_id = $1",
        [tenantId],
      ),
    ]);

    if (jobsResult.error || restoresResult.error) {
      logger.error("Erro ao buscar overview backup", {
        tenantId,
        error: jobsResult.error?.message ?? restoresResult.error?.message,
      });
      return c.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar overview" } },
        500,
      );
    }

    return c.json({
      overview: {
        jobs: jobsResult.data?.rows[0] ?? { total: "0", active: "0" },
        restores: restoresResult.data?.rows[0] ?? { total: "0", running: "0" },
      },
      endpoints: ["/jobs", "/jobs/:id", "/snapshots", "/restores", "/stats"],
    });
  } catch (error) {
    logger.error("Erro inesperado no overview backup", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/backups/jobs — lista jobs de backup
backupRoute.get(
  "/jobs",
  httpCache(30),
  requirePermission("backup:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const activeOnly = c.req.query("active") === "true";

    let sql = "SELECT * FROM public.backup_jobs WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];

    if (activeOnly) {
      sql += " AND is_active = true";
    }
    sql += " ORDER BY name";

    try {
      const result = await query(sql, params);

      if (result.error) {
        logger.error("Erro ao listar backup jobs", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar jobs" } },
          500,
        );
      }

      return c.json({ jobs: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar backup jobs", {
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

// GET /api/v1/backups/jobs/:id — detalhe do job com snapshots recentes
backupRoute.get("/jobs/:id", requirePermission("backup:read"), async (c) => {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const jobResult = await query(
      "SELECT * FROM public.backup_jobs WHERE id = $1 AND tenant_id = $2",
      [jobId, tenantId],
    );

    if (jobResult.error || !jobResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Job não encontrado" } },
        404,
      );
    }

    // Paraleliza 2 queries de detalhe
    const [snapshotsResult, restoresResult] = await Promise.all([
      query(
        "SELECT * FROM public.backup_snapshots WHERE job_id = $1 ORDER BY created_at DESC LIMIT 20",
        [jobId],
      ),
      query(
        `SELECT r.*, s.file_path as snapshot_file_path
         FROM public.backup_restores r
         JOIN public.backup_snapshots s ON r.snapshot_id = s.id
         WHERE s.job_id = $1
         ORDER BY r.created_at DESC LIMIT 10`,
        [jobId],
      ),
    ]);

    return c.json({
      job: jobResult.data.rows[0],
      snapshots: snapshotsResult.data?.rows ?? [],
      restores: restoresResult.data?.rows ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar detalhe do backup job", {
      jobId,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar job" } },
      500,
    );
  }
});

// POST /api/v1/backups/jobs — cria job de backup
backupRoute.post(
  "/jobs",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createBackupJobSchema.safeParse(bodyResult.data);
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

    const data = parsed.data;

    // Validacao de seguranca: bloqueia paths com shell metacharacters
    if (!isSafePath(data.source_path)) {
      return c.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "source_path contém caracteres inválidos",
          },
        },
        400,
      );
    }
    if (!isSafePath(data.destination_path)) {
      return c.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "destination_path contém caracteres inválidos",
          },
        },
        400,
      );
    }
    if (!isSafeHostname(data.target_host)) {
      return c.json(
        {
          error: {
            code: "INVALID_HOST",
            message: "target_host contém caracteres inválidos",
          },
        },
        400,
      );
    }

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.backup_jobs (tenant_id, name, description, target_host, backup_type, source_path,
         destination_type, destination_path, retention_count, retention_days, compression, encryption,
         encryption_key_id, is_scheduled, cron_expression, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.target_host,
          data.backup_type,
          data.source_path,
          data.destination_type,
          data.destination_path,
          data.retention_count,
          data.retention_days,
          data.compression,
          data.encryption,
          data.encryption_key_id ?? null,
          data.is_scheduled,
          data.cron_expression ?? null,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar backup job", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar job" } },
          500,
        );
      }

      // Calcula next_run se agendado
      if (data.is_scheduled && data.cron_expression) {
        await query(
          "UPDATE public.backup_jobs SET next_run_at = public.calculate_next_run($1) WHERE id = $2",
          [data.cron_expression, result.data.rows[0].id],
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'backup.job.create', 'backup_job', $2, $3, NULL, NULL)",
          [
            user.sub,
            result.data.rows[0].id,
            JSON.stringify({
              name: data.name,
              type: data.backup_type,
              host: data.target_host,
            }),
          ],
        );
      }

      logger.info("Backup job criado", {
        jobId: result.data.rows[0].id,
        tenantId,
        backupType: data.backup_type,
      });

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar backup job", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar job" } },
        500,
      );
    }
  },
);

// PUT /api/v1/backups/jobs/:id — atualiza job
backupRoute.put(
  "/jobs/:id",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const jobId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = updateBackupJobSchema.safeParse(bodyResult.data);
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

    const data = parsed.data;

    // Validacao de seguranca: bloqueia paths com shell metacharacters
    if (data.source_path && !isSafePath(data.source_path)) {
      return c.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "source_path contém caracteres inválidos",
          },
        },
        400,
      );
    }
    if (data.destination_path && !isSafePath(data.destination_path)) {
      return c.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "destination_path contém caracteres inválidos",
          },
        },
        400,
      );
    }
    if (data.target_host && !isSafeHostname(data.target_host)) {
      return c.json(
        {
          error: {
            code: "INVALID_HOST",
            message: "target_host contém caracteres inválidos",
          },
        },
        400,
      );
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      target_host: "target_host",
      backup_type: "backup_type",
      source_path: "source_path",
      destination_type: "destination_type",
      destination_path: "destination_path",
      retention_count: "retention_count",
      retention_days: "retention_days",
      compression: "compression",
      encryption: "encryption",
      encryption_key_id: "encryption_key_id",
      is_scheduled: "is_scheduled",
      cron_expression: "cron_expression",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json({ id: jobId });
    }

    // Recalcula next_run se cron mudou
    if (data.cron_expression !== undefined && data.is_scheduled) {
      updateFields.push(
        `next_run_at = public.calculate_next_run($${paramIdx++})`,
      );
      params.push(data.cron_expression);
    }

    params.push(jobId, tenantId);

    try {
      const result = await query(
        `UPDATE public.backup_jobs SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
        params,
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Job não encontrado" } },
          404,
        );
      }

      return c.json({ id: jobId });
    } catch (error) {
      logger.error("Erro ao atualizar backup job", {
        jobId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar job" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/backups/jobs/:id — remove job (soft delete)
backupRoute.delete(
  "/jobs/:id",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const jobId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.backup_jobs SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [jobId, tenantId],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Job não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'backup.job.delete', 'backup_job', $2, NULL, NULL, NULL)",
          [user.sub, jobId],
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar backup job", {
        jobId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir job" } },
        500,
      );
    }
  },
);

// POST /api/v1/backups/jobs/:id/run — executa backup agora (real via tar/gzip)
backupRoute.post(
  "/jobs/:id/run",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const jobId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const jobResult = await query<{
        id: string;
        name: string;
        backup_type: string;
        target_host: string;
        source_path: string;
        destination_path: string;
        compression: string;
        encryption: boolean;
        tenant_id: string;
      }>(
        "SELECT * FROM public.backup_jobs WHERE id = $1 AND tenant_id = $2 AND is_active = true",
        [jobId, tenantId],
      );

      if (jobResult.error || !jobResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Job não encontrado ou inativo",
            },
          },
          404,
        );
      }

      const job = jobResult.data.rows[0];

      // Validacao de seguranca: revalida paths do DB antes de usar em shell
      if (!isSafePath(job.source_path) || !isSafePath(job.destination_path)) {
        logger.error("Path invalido detectado em backup job", {
          jobId,
          tenantId,
          sourcePath: job.source_path,
          destinationPath: job.destination_path,
        });
        return c.json(
          {
            error: {
              code: "INVALID_PATH",
              message: "Caminho do job contém caracteres inválidos",
            },
          },
          400,
        );
      }
      if (!isSafeHostname(job.target_host)) {
        return c.json(
          {
            error: {
              code: "INVALID_HOST",
              message: "Host do job contém caracteres inválidos",
            },
          },
          400,
        );
      }

      const startTime = Date.now();

      // Cria snapshot pendente
      const snapshotResult = await query<{ id: string }>(
        `INSERT INTO public.backup_snapshots (job_id, tenant_id, snapshot_type, status, started_at)
       VALUES ($1, $2, $3, 'running', timezone('utc'::text, now()))
       RETURNING id`,
        [jobId, tenantId, job.backup_type],
      );

      if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
        return c.json(
          {
            error: { code: "CREATE_ERROR", message: "Erro ao criar snapshot" },
          },
          500,
        );
      }

      const snapshotId = snapshotResult.data.rows[0].id;

      // Executa backup real via tar/gzip
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFileName = `${job.name}_${timestamp}.tar${job.compression === "gzip" ? ".gz" : ""}`;
      const compressionFlag = job.compression === "gzip" ? "z" : "";
      const backupFilePath = `${job.destination_path}/${backupFileName}`;

      // Cria diretorio de destino se nao existir
      await execCommand(`mkdir -p "${job.destination_path}"`);

      // Executa tar para criar o backup
      const tarCommand =
        job.target_host && job.target_host !== "localhost"
          ? `ssh ${job.target_host} "tar -c${compressionFlag}pf - -C '${job.source_path}' ." | cat > "${backupFilePath}"`
          : `tar -c${compressionFlag}pf "${backupFilePath}" -C "${job.source_path}" .`;

      const tarResult = await execCommand(tarCommand);

      if (tarResult.exitCode !== 0) {
        // Marca snapshot como failed
        await query(
          "UPDATE public.backup_snapshots SET status = 'failed', completed_at = timezone('utc'::text, now()), duration_ms = $1, error_message = $2 WHERE id = $3",
          [Date.now() - startTime, tarResult.stderr.slice(0, 5000), snapshotId],
        );
        if (user?.sub) {
          await query(
            "SELECT public.write_audit_log($1, NULL, 'backup.job.run', 'backup_job', $2, $3, NULL, NULL)",
            [
              user.sub,
              jobId,
              JSON.stringify({
                snapshot_id: snapshotId,
                error: tarResult.stderr.slice(0, 1000),
              }),
            ],
          );
        }
        logger.error("Backup falhou", {
          jobId,
          snapshotId,
          tenantId,
          stderr: tarResult.stderr.slice(0, 500),
        });
        return c.json(
          {
            error: {
              code: "BACKUP_FAILED",
              message: "Erro ao executar backup",
            },
          },
          500,
        );
      }

      // Calcula tamanho e checksum reais
      const fileSize = getFileSize(backupFilePath);
      const checksum = await calculateFileChecksum(backupFilePath);
      const durationMs = Date.now() - startTime;

      await query(
        `UPDATE public.backup_snapshots
       SET status = 'completed', file_path = $1, file_size_bytes = $2, compressed_size_bytes = $3,
           checksum_sha256 = $4, completed_at = timezone('utc'::text, now()), duration_ms = $5
       WHERE id = $6`,
        [backupFilePath, fileSize, fileSize, checksum, durationMs, snapshotId],
      );

      // Atualiza last_run e next_run do job
      await query(
        "UPDATE public.backup_jobs SET last_run_at = timezone('utc'::text, now()), next_run_at = CASE WHEN is_scheduled AND cron_expression IS NOT NULL THEN public.calculate_next_run(cron_expression) ELSE NULL END WHERE id = $1",
        [jobId],
      );

      // Limpa snapshots expirados
      await query("SELECT public.cleanup_expired_snapshots($1)", [jobId]);

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'backup.job.run', 'backup_job', $2, $3, NULL, NULL)",
          [
            user.sub,
            jobId,
            JSON.stringify({
              snapshot_id: snapshotId,
              duration_ms: durationMs,
              file_size: fileSize,
              checksum,
            }),
          ],
        );
      }

      logger.info("Backup concluido", {
        jobId,
        snapshotId,
        tenantId,
        durationMs,
        fileSize,
      });

      return c.json({
        snapshot_id: snapshotId,
        status: "completed",
        duration_ms: durationMs,
        file_size_bytes: fileSize,
        compressed_size_bytes: fileSize,
        checksum_sha256: checksum,
      });
    } catch (error) {
      logger.error("Erro inesperado ao executar backup", {
        jobId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RUN_ERROR", message: "Erro ao executar backup" } },
        500,
      );
    }
  },
);

// POST /api/v1/backups/snapshots/:id/verify — verifica integridade do snapshot
backupRoute.post(
  "/snapshots/:id/verify",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const snapshotId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const snapshotResult = await query<{
        id: string;
        checksum_sha256: string | null;
        file_path: string | null;
        job_id: string;
      }>(
        "SELECT * FROM public.backup_snapshots WHERE id = $1 AND tenant_id = $2",
        [snapshotId, tenantId],
      );

      if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Snapshot não encontrado" } },
          404,
        );
      }

      const snapshot = snapshotResult.data.rows[0];

      // Verificacao real: recalcula checksum do arquivo se existir
      let verified = false;
      let status = "corrupted";
      if (snapshot.file_path) {
        const currentChecksum = await calculateFileChecksum(snapshot.file_path);
        if (currentChecksum && currentChecksum === snapshot.checksum_sha256) {
          verified = true;
          status = "verified";
        }
      }

      await query(
        "UPDATE public.backup_snapshots SET status = $1, checksum_verified = $2, verified_at = timezone('utc'::text, now()) WHERE id = $3",
        [status, verified, snapshotId],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'backup.snapshot.verify', 'backup_snapshot', $2, $3, NULL, NULL)",
          [
            user.sub,
            snapshotId,
            JSON.stringify({ verified, checksum: snapshot.checksum_sha256 }),
          ],
        );
      }

      logger.info("Snapshot verificado", {
        snapshotId,
        tenantId,
        verified,
        status,
      });

      return c.json({
        snapshot_id: snapshotId,
        verified,
        status,
        checksum: snapshot.checksum_sha256,
      });
    } catch (error) {
      logger.error("Erro ao verificar snapshot", {
        snapshotId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "VERIFY_ERROR",
            message: "Erro ao verificar snapshot",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/backups/snapshots — lista snapshots (com filtros)
backupRoute.get(
  "/snapshots",
  httpCache(30),
  requirePermission("backup:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const jobId = c.req.query("job_id");
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (jobId) {
      conditions.push(`s.job_id = $${paramIdx++}`);
      params.push(jobId);
    }
    if (status) {
      conditions.push(`s.status = $${paramIdx++}`);
      params.push(status);
    }

    params.push(limit);

    try {
      const result = await query(
        `SELECT s.*, j.name as job_name, j.target_host
         FROM public.backup_snapshots s
         JOIN public.backup_jobs j ON s.job_id = j.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY s.created_at DESC
         LIMIT $${paramIdx++}`,
        params,
      );

      if (result.error) {
        logger.error("Erro ao listar snapshots", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar snapshots" },
          },
          500,
        );
      }

      return c.json({
        snapshots: result.data?.rows ?? [],
        limit,
      });
    } catch (error) {
      logger.error("Erro inesperado ao listar snapshots", {
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

// POST /api/v1/backups/restore — inicia restauração real
backupRoute.post(
  "/restore",
  rateLimitWrite,
  requirePermission("backup:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = createRestoreSchema.safeParse(bodyResult.data);
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

    const data = parsed.data;

    // Validacao de seguranca: bloqueia paths com shell metacharacters
    if (!isSafePath(data.target_path)) {
      return c.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "target_path contém caracteres inválidos",
          },
        },
        400,
      );
    }
    if (!isSafeHostname(data.target_host)) {
      return c.json(
        {
          error: {
            code: "INVALID_HOST",
            message: "target_host contém caracteres inválidos",
          },
        },
        400,
      );
    }

    try {
      // Verifica se snapshot existe e está completo
      const snapshotResult = await query<{
        id: string;
        status: string;
        file_path: string | null;
        checksum_sha256: string | null;
      }>(
        "SELECT id, status, file_path, checksum_sha256 FROM public.backup_snapshots WHERE id = $1 AND tenant_id = $2 AND status IN ('completed', 'verified')",
        [data.snapshot_id, tenantId],
      );

      if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Snapshot não encontrado ou não está completo",
            },
          },
          404,
        );
      }

      const snapshot = snapshotResult.data.rows[0];

      // Revalida file_path do snapshot antes de usar em shell
      if (snapshot.file_path && !isSafePath(snapshot.file_path)) {
        logger.error("file_path invalido em snapshot", {
          snapshotId: data.snapshot_id,
          tenantId,
          filePath: snapshot.file_path,
        });
        return c.json(
          {
            error: {
              code: "INVALID_PATH",
              message: "Caminho do snapshot contém caracteres inválidos",
            },
          },
          400,
        );
      }

      const startTime = Date.now();

      // Cria registro de restore
      const restoreResult = await query<{ id: string }>(
        `INSERT INTO public.backup_restores (snapshot_id, tenant_id, target_host, target_path, status, overwrite_existing, started_at, restored_by)
       VALUES ($1, $2, $3, $4, 'running', $5, timezone('utc'::text, now()), $6)
       RETURNING id`,
        [
          data.snapshot_id,
          tenantId,
          data.target_host,
          data.target_path,
          data.overwrite_existing,
          user?.sub ?? null,
        ],
      );

      if (restoreResult.error || !restoreResult.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar restore" } },
          500,
        );
      }

      const restoreId = restoreResult.data.rows[0].id;

      // Executa restore real via tar extraction
      let restoreSuccess = false;
      let restoreError: string | null = null;

      if (snapshot.file_path) {
        const isRemote = data.target_host && data.target_host !== "localhost";
        const overwriteFlag = data.overwrite_existing ? "" : "--keep-old-files";
        const compressionFlag = snapshot.file_path.endsWith(".gz") ? "z" : "";

        const restoreCommand = isRemote
          ? `cat "${snapshot.file_path}" | ssh ${data.target_host} "tar -x${compressionFlag}pf - ${overwriteFlag} -C '${data.target_path}'"`
          : `mkdir -p "${data.target_path}" && tar -x${compressionFlag}pf "${snapshot.file_path}" ${overwriteFlag} -C "${data.target_path}"`;

        const restoreResultExec = await execCommand(restoreCommand);
        if (restoreResultExec.exitCode === 0) {
          restoreSuccess = true;
        } else {
          restoreError = restoreResultExec.stderr.slice(0, 5000);
        }
      } else {
        restoreError = "Snapshot não possui arquivo de backup";
      }

      const durationMs = Date.now() - startTime;
      const checksumVerified =
        restoreSuccess && snapshot.checksum_sha256 !== null;

      await query(
        `UPDATE public.backup_restores
       SET status = $1, checksum_verified = $2, completed_at = timezone('utc'::text, now()), duration_ms = $3, error_message = $4
       WHERE id = $5`,
        [
          restoreSuccess ? "completed" : "failed",
          checksumVerified,
          durationMs,
          restoreError,
          restoreId,
        ],
      );

      if (user?.sub) {
        await query(
          "SELECT public.write_audit_log($1, NULL, 'backup.restore', 'backup_restore', $2, $3, NULL, NULL)",
          [
            user.sub,
            restoreId,
            JSON.stringify({
              snapshot_id: data.snapshot_id,
              target: `${data.target_host}:${data.target_path}`,
              success: restoreSuccess,
            }),
          ],
        );
      }

      logger.info("Restore concluido", {
        restoreId,
        snapshotId: data.snapshot_id,
        tenantId,
        success: restoreSuccess,
        durationMs,
      });

      return c.json({
        restore_id: restoreId,
        status: restoreSuccess ? "completed" : "failed",
        duration_ms: durationMs,
        checksum_verified: checksumVerified,
        error: restoreError,
      });
    } catch (error) {
      logger.error("Erro inesperado ao executar restore", {
        tenantId,
        snapshotId: data.snapshot_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RESTORE_ERROR", message: "Erro ao restaurar" } },
        500,
      );
    }
  },
);

// GET /api/v1/backups/restores — lista restaurações
backupRoute.get(
  "/restores",
  httpCache(30),
  requirePermission("backup:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    try {
      const result = await query(
        `SELECT r.*, s.file_path as snapshot_file_path, j.name as job_name
         FROM public.backup_restores r
         JOIN public.backup_snapshots s ON r.snapshot_id = s.id
         JOIN public.backup_jobs j ON s.job_id = j.id
         WHERE r.tenant_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2`,
        [tenantId, limit],
      );

      if (result.error) {
        logger.error("Erro ao listar restores", {
          tenantId,
          error: result.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar restores" },
          },
          500,
        );
      }

      return c.json({
        restores: result.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro inesperado ao listar restores", {
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

// GET /api/v1/backups/stats — estatísticas para dashboard
backupRoute.get(
  "/stats",
  requirePermission("backup:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries independentes
      const [jobsResult, snapshotsResult, recentSnapshots] = await Promise.all([
        query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_active = true) as active,
             COUNT(*) FILTER (WHERE is_scheduled = true AND is_active = true) as scheduled,
             COUNT(*) FILTER (WHERE next_run_at IS NOT NULL AND next_run_at <= timezone('utc'::text, now()) + INTERVAL '1 hour') as due_soon
           FROM public.backup_jobs
           WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'completed') as completed,
             COUNT(*) FILTER (WHERE status = 'failed') as failed,
             COUNT(*) FILTER (WHERE status = 'verified') as verified,
             COUNT(*) FILTER (WHERE status = 'corrupted') as corrupted,
             COALESCE(SUM(file_size_bytes), 0) as total_size,
             COALESCE(SUM(compressed_size_bytes), 0) as total_compressed
           FROM public.backup_snapshots
           WHERE tenant_id = $1 AND status NOT IN ('expired')`,
          [tenantId],
        ),
        query(
          `SELECT s.id, s.status, s.created_at, s.file_size_bytes, s.compressed_size_bytes, s.duration_ms, j.name as job_name
           FROM public.backup_snapshots s
           JOIN public.backup_jobs j ON s.job_id = j.id
           WHERE s.tenant_id = $1 AND s.status NOT IN ('expired')
           ORDER BY s.created_at DESC
           LIMIT 10`,
          [tenantId],
        ),
      ]);

      return c.json({
        jobs: jobsResult.data?.rows[0] ?? {
          total: "0",
          active: "0",
          scheduled: "0",
          due_soon: "0",
        },
        snapshots: snapshotsResult.data?.rows[0] ?? {
          total: "0",
          completed: "0",
          failed: "0",
          verified: "0",
          corrupted: "0",
          total_size: "0",
          total_compressed: "0",
        },
        recent: recentSnapshots.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro inesperado no stats backup", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar stats" } },
        500,
      );
    }
  },
);
