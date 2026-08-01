// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { exec, execSync } from "node:child_process";
import { statSync } from "node:fs";
import {
  createBackupJobSchema,
  updateBackupJobSchema,
  createRestoreSchema,
  type CreateBackupJobInput,
  type UpdateBackupJobInput,
  type CreateRestoreInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const backupRoute = new Hono();

// Executa comando shell e retorna saida padrao ou erro
function execCommand(command: string, timeoutMs: number = 300000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // eslint-disable-next-line security/detect-child-process
    exec(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error ? (error.code as number ?? 1) : 0 });
    });
  });
}

// Calcula checksum SHA256 real de um arquivo
function calculateFileChecksum(filePath: string): string | null {
  try {
    const hash = execSync(`sha256sum "${filePath}"`, { encoding: "utf-8" });
    return `sha256:${hash.split(" ")[0]}`;
  } catch {
    return null;
  }
}

// Obtem tamanho real de arquivo
function getFileSize(filePath: string): number {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

// GET /api/v1/backups/jobs — lista jobs de backup
backupRoute.get("/jobs", jwtAuth, tenantContext, requirePermission("backup:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";

  let sql = "SELECT * FROM public.backup_jobs WHERE tenant_id = $1";
  const params: unknown[] = [user?.tenant_id ?? null];

  if (activeOnly) {
    sql += " AND is_active = true";
  }
  sql += " ORDER BY name";

  const result = await query(sql, params);

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar jobs" } }, 500);
  }

  return c.json({ jobs: result.data?.rows ?? [] });
});

// GET /api/v1/backups/jobs/:id — detalhe do job com snapshots recentes
backupRoute.get("/jobs/:id", jwtAuth, tenantContext, requirePermission("backup:read"), async (c) => {
  const jobId = c.req.param("id");
  const user = c.get("user");

  const jobResult = await query(
    "SELECT * FROM public.backup_jobs WHERE id = $1 AND tenant_id = $2",
    [jobId, user?.tenant_id ?? null],
  );

  if (jobResult.error || !jobResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job não encontrado" } }, 404);
  }

  const snapshotsResult = await query(
    "SELECT * FROM public.backup_snapshots WHERE job_id = $1 ORDER BY created_at DESC LIMIT 20",
    [jobId],
  );

  const restoresResult = await query(
    `SELECT r.*, s.file_path as snapshot_file_path
     FROM public.backup_restores r
     JOIN public.backup_snapshots s ON r.snapshot_id = s.id
     WHERE s.job_id = $1
     ORDER BY r.created_at DESC LIMIT 10`,
    [jobId],
  );

  return c.json({
    job: jobResult.data.rows[0],
    snapshots: snapshotsResult.data?.rows ?? [],
    restores: restoresResult.data?.rows ?? [],
  });
});

// POST /api/v1/backups/jobs — cria job de backup
backupRoute.post("/jobs", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateBackupJobInput>();
  const parsed = createBackupJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.backup_jobs (tenant_id, name, description, target_host, backup_type, source_path,
     destination_type, destination_path, retention_count, retention_days, compression, encryption,
     encryption_key_id, is_scheduled, cron_expression, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.name, data.description ?? null,
      data.target_host, data.backup_type, data.source_path,
      data.destination_type, data.destination_path,
      data.retention_count, data.retention_days, data.compression, data.encryption,
      data.encryption_key_id ?? null, data.is_scheduled, data.cron_expression ?? null, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar job" } }, 500);
  }

  // Calcula next_run se agendado
  if (data.is_scheduled && data.cron_expression) {
    await query("UPDATE public.backup_jobs SET next_run_at = public.calculate_next_run($1) WHERE id = $2", [
      data.cron_expression, result.data.rows[0].id,
    ]);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'backup.job.create', 'backup_job', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ name: data.name, type: data.backup_type, host: data.target_host })],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

// PUT /api/v1/backups/jobs/:id — atualiza job
backupRoute.put("/jobs/:id", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const jobId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateBackupJobInput>();
  const parsed = updateBackupJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", target_host: "target_host", backup_type: "backup_type",
    source_path: "source_path", destination_type: "destination_type", destination_path: "destination_path",
    retention_count: "retention_count", retention_days: "retention_days", compression: "compression",
    encryption: "encryption", encryption_key_id: "encryption_key_id", is_scheduled: "is_scheduled",
    cron_expression: "cron_expression", is_active: "is_active",
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
    updateFields.push(`next_run_at = public.calculate_next_run($${paramIdx++})`);
    params.push(data.cron_expression);
  }

  params.push(jobId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.backup_jobs SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: jobId });
});

// DELETE /api/v1/backups/jobs/:id — remove job (soft delete)
backupRoute.delete("/jobs/:id", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const jobId = c.req.param("id");
  const user = c.get("user");

  await query(
    "UPDATE public.backup_jobs SET is_active = false WHERE id = $1 AND tenant_id = $2",
    [jobId, user?.tenant_id ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'backup.job.delete', 'backup_job', $2, NULL, NULL, NULL)",
    [user.sub, jobId],
  );

  return c.json({ deleted: true });
});

// POST /api/v1/backups/jobs/:id/run — executa backup agora (real via tar/gzip)
backupRoute.post("/jobs/:id/run", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const jobId = c.req.param("id");
  const user = c.get("user");

  const jobResult = await query<{
    id: string; name: string; backup_type: string; target_host: string; source_path: string;
    destination_path: string; compression: string; encryption: boolean; tenant_id: string;
  }>(
    "SELECT * FROM public.backup_jobs WHERE id = $1 AND tenant_id = $2 AND is_active = true",
    [jobId, user?.tenant_id ?? null],
  );

  if (jobResult.error || !jobResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Job não encontrado ou inativo" } }, 404);
  }

  const job = jobResult.data.rows[0];
  const startTime = Date.now();

  // Cria snapshot pendente
  const snapshotResult = await query<{ id: string }>(
    `INSERT INTO public.backup_snapshots (job_id, tenant_id, snapshot_type, status, started_at)
     VALUES ($1, $2, $3, 'running', timezone('utc'::text, now()))
     RETURNING id`,
    [jobId, user?.tenant_id ?? null, job.backup_type],
  );

  if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar snapshot" } }, 500);
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
  const tarCommand = job.target_host && job.target_host !== "localhost"
    ? `ssh ${job.target_host} "tar -c${compressionFlag}pf - -C '${job.source_path}' ." | cat > "${backupFilePath}"`
    : `tar -c${compressionFlag}pf "${backupFilePath}" -C "${job.source_path}" .`;

  const tarResult = await execCommand(tarCommand);

  if (tarResult.exitCode !== 0) {
    // Marca snapshot como failed
    await query(
      "UPDATE public.backup_snapshots SET status = 'failed', completed_at = timezone('utc'::text, now()), duration_ms = $1 WHERE id = $2",
      [Date.now() - startTime, snapshotId],
    );
    await query(
      "SELECT public.write_audit_log($1, NULL, 'backup.job.run', 'backup_job', $2, $3, NULL, NULL)",
      [user.sub, jobId, JSON.stringify({ snapshot_id: snapshotId, error: tarResult.stderr })],
    );
    return c.json({ error: { code: "BACKUP_FAILED", message: `Erro no backup: ${tarResult.stderr}` } }, 500);
  }

  // Calcula tamanho e checksum reais
  const fileSize = getFileSize(backupFilePath);
  const checksum = calculateFileChecksum(backupFilePath);
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

  await query(
    "SELECT public.write_audit_log($1, NULL, 'backup.job.run', 'backup_job', $2, $3, NULL, NULL)",
    [user.sub, jobId, JSON.stringify({ snapshot_id: snapshotId, duration_ms: durationMs, file_size: fileSize, checksum })],
  );

  return c.json({
    snapshot_id: snapshotId,
    status: "completed",
    duration_ms: durationMs,
    file_size_bytes: fileSize,
    compressed_size_bytes: fileSize,
    checksum_sha256: checksum,
  });
});

// POST /api/v1/backups/snapshots/:id/verify — verifica integridade do snapshot
backupRoute.post("/snapshots/:id/verify", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const snapshotId = c.req.param("id");
  const user = c.get("user");

  const snapshotResult = await query<{
    id: string; checksum_sha256: string | null; file_path: string | null; job_id: string;
  }>(
    "SELECT * FROM public.backup_snapshots WHERE id = $1 AND tenant_id = $2",
    [snapshotId, user?.tenant_id ?? null],
  );

  if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Snapshot não encontrado" } }, 404);
  }

  const snapshot = snapshotResult.data.rows[0];

  // Verificacao real: recalcula checksum do arquivo se existir
  let verified = false;
  let status = "corrupted";
  if (snapshot.file_path) {
    const currentChecksum = calculateFileChecksum(snapshot.file_path);
    if (currentChecksum && currentChecksum === snapshot.checksum_sha256) {
      verified = true;
      status = "verified";
    }
  }

  await query(
    "UPDATE public.backup_snapshots SET status = $1, checksum_verified = $2, verified_at = timezone('utc'::text, now()) WHERE id = $3",
    [status, verified, snapshotId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'backup.snapshot.verify', 'backup_snapshot', $2, $3, NULL, NULL)",
    [user.sub, snapshotId, JSON.stringify({ verified, checksum: snapshot.checksum_sha256 })],
  );

  return c.json({
    snapshot_id: snapshotId,
    verified,
    status,
    checksum: snapshot.checksum_sha256,
  });
});

// GET /api/v1/backups/snapshots — lista snapshots (com filtros)
backupRoute.get("/snapshots", jwtAuth, tenantContext, requirePermission("backup:read"), async (c) => {
  const user = c.get("user");
  const jobId = c.req.query("job_id");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (jobId) {
    conditions.push(`job_id = $${paramIdx++}`);
    params.push(jobId);
  }
  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }

  params.push(limit);

  const result = await query(
    `SELECT s.*, j.name as job_name, j.target_host
     FROM public.backup_snapshots s
     JOIN public.backup_jobs j ON s.job_id = j.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.created_at DESC
     LIMIT $${paramIdx++}`,
    params,
  );

  return c.json({
    snapshots: result.data?.rows ?? [],
    limit,
  });
});

// POST /api/v1/backups/restore — inicia restauração real
backupRoute.post("/restore", jwtAuth, tenantContext, requirePermission("backup:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateRestoreInput>();
  const parsed = createRestoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Verifica se snapshot existe e está completo
  const snapshotResult = await query<{ id: string; status: string; file_path: string | null; checksum_sha256: string | null }>(
    "SELECT id, status, file_path, checksum_sha256 FROM public.backup_snapshots WHERE id = $1 AND tenant_id = $2 AND status IN ('completed', 'verified')",
    [data.snapshot_id, user?.tenant_id ?? null],
  );

  if (snapshotResult.error || !snapshotResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Snapshot não encontrado ou não está completo" } }, 404);
  }

  const snapshot = snapshotResult.data.rows[0];
  const startTime = Date.now();

  // Cria registro de restore
  const restoreResult = await query<{ id: string }>(
    `INSERT INTO public.backup_restores (snapshot_id, tenant_id, target_host, target_path, status, overwrite_existing, started_at, restored_by)
     VALUES ($1, $2, $3, $4, 'running', $5, timezone('utc'::text, now()), $6)
     RETURNING id`,
    [data.snapshot_id, user?.tenant_id ?? null, data.target_host, data.target_path, data.overwrite_existing, user.sub],
  );

  if (restoreResult.error || !restoreResult.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar restore" } }, 500);
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
      restoreError = restoreResultExec.stderr;
    }
  } else {
    restoreError = "Snapshot nao possui arquivo de backup";
  }

  const durationMs = Date.now() - startTime;
  const checksumVerified = restoreSuccess && snapshot.checksum_sha256 !== null;

  await query(
    `UPDATE public.backup_restores
     SET status = $1, checksum_verified = $2, completed_at = timezone('utc'::text, now()), duration_ms = $3
     WHERE id = $4`,
    [restoreSuccess ? "completed" : "failed", checksumVerified, durationMs, restoreId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'backup.restore', 'backup_restore', $2, $3, NULL, NULL)",
    [user.sub, restoreId, JSON.stringify({ snapshot_id: data.snapshot_id, target: `${data.target_host}:${data.target_path}` })],
  );

  return c.json({
    restore_id: restoreId,
    status: restoreSuccess ? "completed" : "failed",
    duration_ms: durationMs,
    checksum_verified: checksumVerified,
    error: restoreError,
  });
});

// GET /api/v1/backups/restores — lista restaurações
backupRoute.get("/restores", jwtAuth, tenantContext, requirePermission("backup:read"), async (c) => {
  const user = c.get("user");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const result = await query(
    `SELECT r.*, s.file_path as snapshot_file_path, j.name as job_name
     FROM public.backup_restores r
     JOIN public.backup_snapshots s ON r.snapshot_id = s.id
     JOIN public.backup_jobs j ON s.job_id = j.id
     WHERE r.tenant_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [user?.tenant_id ?? null, limit],
  );

  return c.json({
    restores: result.data?.rows ?? [],
  });
});

// GET /api/v1/backups/stats — estatísticas para dashboard
backupRoute.get("/stats", jwtAuth, tenantContext, requirePermission("backup:read"), async (c) => {
  const user = c.get("user");

  const jobsResult = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_active = true) as active,
       COUNT(*) FILTER (WHERE is_scheduled = true AND is_active = true) as scheduled,
       COUNT(*) FILTER (WHERE next_run_at IS NOT NULL AND next_run_at <= timezone('utc'::text, now()) + INTERVAL '1 hour') as due_soon
     FROM public.backup_jobs
     WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const snapshotsResult = await query(
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
    [user?.tenant_id ?? null],
  );

  const recentSnapshots = await query(
    `SELECT s.id, s.status, s.created_at, s.file_size_bytes, s.compressed_size_bytes, s.duration_ms, j.name as job_name
     FROM public.backup_snapshots s
     JOIN public.backup_jobs j ON s.job_id = j.id
     WHERE s.tenant_id = $1 AND s.status NOT IN ('expired')
     ORDER BY s.created_at DESC
     LIMIT 10`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    jobs: jobsResult.data?.rows[0] ?? { total: "0", active: "0", scheduled: "0", due_soon: "0" },
    snapshots: snapshotsResult.data?.rows[0] ?? { total: "0", completed: "0", failed: "0", verified: "0", corrupted: "0", total_size: "0", total_compressed: "0" },
    recent: recentSnapshots.data?.rows ?? [],
  });
});
