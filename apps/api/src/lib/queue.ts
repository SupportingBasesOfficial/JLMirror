import { Queue, Worker, type Processor } from "bullmq";
import Redlock from "redlock";
import { createBullMQConnection, createCacheClient } from "@repo/cache";

interface RedlockLock {
  release(): Promise<void>;
}

interface RedlockInstance {
  acquire(resources: string[], duration: number): Promise<RedlockLock>;
}

// Conexão Redis dedicada para BullMQ — exige maxRetriesPerRequest: null
const redisConnection = createBullMQConnection();

// Redlock usa conexão cache normal (não BullMQ)
const redlock: RedlockInstance = new Redlock([createCacheClient()], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 100,
});

interface QueueDefinition {
  name: string;
  concurrency: number;
}

const QUEUE_DEFINITIONS: QueueDefinition[] = [
  { name: "task-scheduler", concurrency: 5 },
  { name: "alerting-engine", concurrency: 1 },
  { name: "device-sync", concurrency: 1 },
  { name: "correlation-engine", concurrency: 1 },
];

const queues = new Map<string, Queue>();
const workers: Worker[] = [];

// Cria ou retorna uma fila pelo nome
export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redisConnection });
    queues.set(name, queue);
  }
  return queue;
}

// Registra um repeatable job usando Redlock para garantir execução única
export async function registerRepeatableJob(
  queueName: string,
  jobName: string,
  repeatPattern: { every: number } | { pattern: string },
  jobData?: Record<string, unknown>,
): Promise<void> {
  const lockKey = `lock:repeatable:${queueName}:${jobName}`;
  const lock = await redlock.acquire([lockKey], 10_000);
  try {
    const queue = getQueue(queueName);
    const existing = await queue.getRepeatableJobs();
    const alreadyRegistered = existing.some((j) => j.name === jobName);
    if (!alreadyRegistered) {
      await queue.add(
        jobName,
        jobData ?? {},
        { repeat: repeatPattern, removeOnComplete: 100, removeOnFail: 50 },
      );
      console.warn(`[queue] Repeatable job "${jobName}" registrado na fila "${queueName}"`);
    }
  } finally {
    await lock.release();
  }
}

// Inicia um worker para uma fila com o processador fornecido
export function startWorker(queueName: string, processor: Processor): Worker {
  const def = QUEUE_DEFINITIONS.find((d) => d.name === queueName);
  const concurrency = def?.concurrency ?? 1;

  const worker = new Worker(queueName, processor, {
    connection: redisConnection,
    concurrency,
  });

  worker.on("completed", (job) => {
    console.warn(`[queue:${queueName}] Job ${job.id} (${job.name}) concluido`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[queue:${queueName}] Job ${job?.id ?? "?"} (${job?.name ?? "?"}) falhou: ${err.message}`);
  });

  workers.push(worker);
  console.warn(`[queue:${queueName}] Worker iniciado (concurrency: ${concurrency})`);
  return worker;
}

// Para todos os workers e fecha filas graciosamente
export async function stopAllQueues(): Promise<void> {
  console.warn("[queue] Parando workers...");
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;

  console.warn("[queue] Fechando filas...");
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();

  console.warn("[queue] Workers e filas encerrados");
}
