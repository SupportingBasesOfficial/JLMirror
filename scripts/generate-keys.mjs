#!/usr/bin/env node

/**
 * Gera chaves criptográficas para JLMIRROR:
 * - RSA-2048 PEM (par público/privada) para JWT RS256
 * - AES-256-GCM hex (64 chars) para criptografia de credenciais Zabbix
 *
 * As chaves PEM são armazenadas em base64 dentro do .env para evitar problemas
 * com quebras de linha no docker compose e no dotenv.
 *
 * Uso: node scripts/generate-keys.mjs
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

const privateKeyBase64 = Buffer.from(privateKey).toString("base64");
const publicKeyBase64 = Buffer.from(publicKey).toString("base64");
const zabbixKeyHex = randomBytes(32).toString("hex");

const envContent = `# === Database ===
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jlmirror

# === Redis ===
REDIS_URL=redis://localhost:6379

# === JWT RS256 (base64 encoded PEM) ===
JWT_PRIVATE_KEY=${privateKeyBase64}
JWT_PUBLIC_KEY=${publicKeyBase64}
JWT_ACCESS_TOKEN_TTL_MINUTES=15
JWT_REFRESH_TOKEN_TTL_DAYS=30
JWT_ISSUER=jl-informatica-portal
JWT_AUDIENCE=jl-portal-api

# === Zabbix ===
ZABBIX_ENCRYPTION_KEY_HEX=${zabbixKeyHex}
ZABBIX_API_URL=https://zabbix.jlinformatica.com.br/api_jsonrpc.php

# === Server ===
API_PORT=3001
API_INTERNAL_URL=http://localhost:3001

# === Frontend ===
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# === Sentry (opcional) ===
SENTRY_DSN=
`;

writeFileSync(".env", envContent, "utf-8");

console.warn("Arquivo .env gerado com sucesso em c:\\Projects\\JLMIRROR\\.env");
console.warn("ZABBIX_ENCRYPTION_KEY_HEX:", zabbixKeyHex);
