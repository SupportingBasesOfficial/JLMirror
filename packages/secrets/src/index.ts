// Registry de segredos com suporte a rotação dinâmica
// Lê de env vars e mantém cache em memória

interface SecretRegistry {
  [key: string]: string | undefined;
}

let registry: SecretRegistry = {};

// Inicializa o registry a partir das variáveis de ambiente
export function initializeSecrets(): void {
  registry = {
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
    JWT_ISSUER: process.env.JWT_ISSUER,
    JWT_AUDIENCE: process.env.JWT_AUDIENCE,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  };
}

// Busca um segredo do registry
export function getSecret(key: string): string | undefined {
  return registry[key] ?? process.env[key];
}

// Atualiza um segredo em runtime (para rotação)
export function setSecret(key: string, value: string): void {
  registry[key] = value;
}
