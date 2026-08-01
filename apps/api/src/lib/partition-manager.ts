// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Partition Manager — cria partições mensais futuras e droppa partições antigas
// Roda diariamente via BullMQ

interface PartitionedTable {
  name: string;
  column: string;
  retentionMonths: number;
}

const PARTITIONED_TABLES: PartitionedTable[] = [
  { name: "system_logs", column: "created_at", retentionMonths: 6 },
  { name: "trace_spans", column: "created_at", retentionMonths: 1 },
  { name: "capacity_metrics", column: "created_at", retentionMonths: 12 },
];

const QUEUE_NAME = "partition-manager";
const PARTITION_LOOKAHEAD_MONTHS = 3;

export async function startPartitionManager(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "manage-partitions",
    { pattern: "0 2 * * *" },
  );

  startWorker(QUEUE_NAME, async () => {
    try {
      await createFuturePartitions();
      await dropOldPartitions();
    } catch (err) {
      console.error("[partition] Erro:", err instanceof Error ? err.message : String(err));
    }
  });
}

export function stopPartitionManager(): void {
  console.warn("[partition] Manager parado");
}

async function createFuturePartitions(): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    for (let i = 0; i <= PARTITION_LOOKAHEAD_MONTHS; i++) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setMonth(monthStart.getMonth() + i);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const partitionName = `${table.name}_${monthStart.getFullYear()}${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

      // Verifica se a partição já existe
      const checkResult = await query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = 'public' AND tablename = $1
        ) as exists`,
        [partitionName],
      );

      if (checkResult.data?.rows[0]?.exists) continue;

      // Cria a partição
      const createResult = await query(
        `CREATE TABLE IF NOT EXISTS public.${partitionName}
         PARTITION OF public.${table.name}
         FOR VALUES FROM ($1) TO ($2)`,
        [monthStart.toISOString(), monthEnd.toISOString()],
      );

      if (createResult.error) {
        console.error(`[partition] Erro ao criar ${partitionName}: ${createResult.error.message}`);
      } else {
        console.warn(`[partition] Partição criada: ${partitionName} (${monthStart.toISOString().substring(0, 10)} a ${monthEnd.toISOString().substring(0, 10)})`);
      }
    }
  }
}

// Droppa partições mais antigas que o retention period de cada tabela
async function dropOldPartitions(): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    const cutoffDate = new Date();
    cutoffDate.setDate(1);
    cutoffDate.setMonth(cutoffDate.getMonth() - table.retentionMonths);
    cutoffDate.setHours(0, 0, 0, 0);

    const prefix = `${table.name}_`;
    const cutoffYYYYMM = `${cutoffDate.getFullYear()}${String(cutoffDate.getMonth() + 1).padStart(2, "0")}`;

    // Busca todas as partições da tabela
    const result = await query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename LIKE $1
       ORDER BY tablename ASC`,
      [`${prefix}%`],
    );

    if (result.error || !result.data?.rows.length) continue;

    for (const row of result.data.rows) {
      // Extrai YYYYMM do nome da partição
      const partitionYYYYMM = row.tablename.replace(prefix, "");
      if (partitionYYYYMM.length !== 6) continue;

      // Se a partição é mais antiga que o cutoff, droppa
      if (partitionYYYYMM < cutoffYYYYMM) {
        const dropResult = await query(
          `DROP TABLE IF EXISTS public.${row.tablename} CASCADE`,
        );
        if (dropResult.error) {
          console.error(`[partition] Erro ao droppar ${row.tablename}: ${dropResult.error.message}`);
        } else {
          console.warn(`[partition] Partição droppada: ${row.tablename} (mais antiga que ${table.retentionMonths} meses)`);
        }
      }
    }
  }
}
