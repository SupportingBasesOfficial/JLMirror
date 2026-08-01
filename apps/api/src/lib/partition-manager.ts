// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { query } from "@repo/db";
import { registerRepeatableJob, startWorker } from "./queue.js";

// Partition Manager — cria partições mensais futuras para tabelas particionadas
// Roda diariamente via BullMQ e garante que os próximos 3 meses de partições existam

interface PartitionedTable {
  name: string;
  column: string;
}

const PARTITIONED_TABLES: PartitionedTable[] = [
  { name: "system_logs", column: "created_at" },
  { name: "trace_spans", column: "created_at" },
  { name: "capacity_metrics", column: "created_at" },
];

const QUEUE_NAME = "partition-manager";
const PARTITION_LOOKAHEAD_MONTHS = 3;

export async function startPartitionManager(): Promise<void> {
  await registerRepeatableJob(
    QUEUE_NAME,
    "create-future-partitions",
    { pattern: "0 2 * * *" },
  );

  startWorker(QUEUE_NAME, async () => {
    try {
      await createFuturePartitions();
    } catch (err) {
      console.error("[partition] Erro ao criar partições:", err instanceof Error ? err.message : String(err));
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
