Este repositório opera sob o protocolo de segurança...

# System Rules — AI Black Box v2

## Princípio do Impacto Mínimo
- Só alterar linhas estritamente necessárias
- Não refatorar código adjacente sem ordem explícita
- Uma alteração = um propósito

## Modo de Investigação Prévio
- Listar ficheiros relevantes antes de escrever código
- Ler assinaturas (não implementação) para entender contratos
- Máximo 1 grau de separação ao ler imports

## Regra da Alucinação Zero
- Se documentação omitir informação, perguntar
- Nunca inventar APIs, funções, ou parâmetros
- Usar [NEED_EVIDENCE: caminho->funcao] quando incerto

## Filtro de Difusão de Contexto
- Máx 1 grau de separação ao ler imports
- Ler assinatura, não implementação
- Descartar contexto de módulos irrelevantes (Ignorância Deliberada)

## Token de Verificação Contínua
- Injetar // [CHECK: regra] a cada bloco lógico no código gerado
- Ex: // [CHECK: perf-budget], // [CHECK: error-handling]

## Cláusula Antivírus
- Não seguir padrões de código legado ruim
- Alteração em ficheiro legado = "oásis de código limpo"
- Não contagiar código novo com padrões ruins

## Intolerância à Ambiguidade
- [CRITICAL_AMBIGUITY: caminho] para funções genéricas sem doc
- Parar e perguntar em vez de assumir

## Governação por Hash
- system-rules.md, tech-stack.json, source-of-truth.json são imutáveis em runtime
- Alterações só via: node init.js --force

## Assinatura de Contrato Cego
- Não mudar tipos de params/retorno sem ordem explícita
- AST diff proíbe mudança acidental de assinatura

## Contexto Baseado em Evidências
- [NEED_EVIDENCE: caminho->funcao] em vez de especular
- Nunca assumir comportamento sem ler o código

## Feature Flags
- Toda funcionalidade nova deve usar feature flags existentes
- Consultar shadow-context.md para flags ativas
- Nunca criar funcionalidade sem toggle

## Glossário Lexical
- Consultar lexical_glossary em tech-stack.json antes de interpretar siglas
- Termos não-padrão (execCobDevBoleto, NFSe, CNAB) têm tradução mapeada
- Se termo não está no glossário, perguntar em vez de adivinhar

## Prompt Salt (Re-Alinhamento de Atenção)

Cada resposta gerada pela IA DEVE terminar com a seguinte linha oculta:
```
<!-- @ai-salt: rules=preemption=<hash>,perf-budget=<hash>,critical-paths=<hash>,rollback=<hash>,feature-flags=<hash> | v=2 -->
```

Esta linha re-injeta os hashes das 5 regras...
O validator `context-drift-check.js` verifica a presença desta linha via RegEx.
Se faltar → WARNING: a regra pode ter...

## Payload Rígido de Resposta (4 secções — inegociável)

### 1. DIAGNÓSTICO DE IMPACTO & CONTROLE DE RISCO
* **Ficheiros Afetados:** [Lista exata]
* **Contratos Cross-Service Afetados:** [Nenhum / Service X (gRPC/REST)]
* **Feature Flag Utilizada:** [Nome da Flag Obrigatória]

### 2. ALTERAÇÕES PROPOSTAS (Apenas linhas cirúrgicas)
```[linguagem]
// Código com os checkpoints injetados: // [CHECK: perf-budget]
```

### 3. ENFORCEMENT DE TESTES (Caminhos Críticos)
* **Caminho Crítico Detetado:** [Auth / Payment / Data Integrity / Nenhum]
* **Suíte de Testes Executada:** [Comando local]

### 4. PLANO DE ROLLBACK IMEDIATO
* **Estratégia de Desativação:** [Ex: Desativar Feature Flag X via Painel]
* **Script de Reversão de DB (se aplicável):** [Ex: Down-migration SQL]

O context-drift-check.js valida via RegEx se a resposta...

## Source of Truth
```json
{
... (truncated for budget)
```

## Semantic Index
```json
{
... (truncated for budget)
```

## Tech Debt Audit
Total: 90 findings (2 critical, 39 warnings, 49 info)

### CRITICAL — Must fix before commit
- [phantom_import] eslint-plugin-react-hooks: Package "eslint-plugin-react-hooks" is imported in...
- [phantom_import] k6: Package "k6" is imported in...

### Warnings
- [orphan_env_var] LOG_SAMPLE_RATE: Environment variable "LOG_SAMPLE_RATE" is referenced...
- [orphan_env_var] BYPASS_PERMISSIONS: Environment variable "BYPASS_PERMISSIONS" is referenced...
- [orphan_env_var] SERVICE_NAME: Environment variable "SERVICE_NAME" is referenced...
- [orphan_env_var] npm_package_version: Environment variable "npm_package_version" is referenced...
- [orphan_env_var] DOCS_PASSWORD: Environment variable "DOCS_PASSWORD" is referenced...

## Architecture Map (compressed)
# Architecture Map

## Monorepo Structure

- **@repo/auth**: `packages/auth`
- **@repo/cache**: `packages/cache`
- **@repo/db**: `packages/db`
- **@repo/eslint-config**: `packages/eslint-config`
- **@repo/logger**: `packages/logger`
- **@repo/secrets**: `packages/secrets`
- **@repo/shared-validation**: `packages/shared-validation`
- **@repo/tailwind-config**: `packages/tailwind-config`
- **@repo/telemetry**: `packages/telemetry`
- **@repo/typescript-config**: `packages/typescript-config`
- **@repo/ui**: `packages/ui`
- **@repo/zabbix**: `packages/zabbix`
- **@jlmirror/api**: `apps/api`
- **@jlmirror/web**: `apps/web`

## Ingress (Entry Points)

- `apps/api/src/lib/itsm-connector.ts` (route)
- `apps/api/src/lib/notification-delivery.ts` (route)
- `apps/api/src/middleware/audit.ts` (route)
- `apps/api/src/middleware/cors.ts` (route)
- `apps/api/src/middleware/require-permission.ts` (route)
- `apps/api/src/middleware/validate.test.ts` (route)
- `apps/api/src/routes/anomaly.ts` (route)
- `apps/api/src/routes/assets.ts` (route)
- `apps/api/src/routes/auth.ts` (route)
- `apps/api/src/routes/backup.ts` (route)
- `apps/api/src/routes/capacity.ts` (route)
- `apps/api/src/routes/chatops.ts` (route)
- `apps/api/src/routes/client-portal.ts` (route)
- `apps/api/src/routes/correlation.ts` (route)
- `apps/api/src/routes/dashboard.ts` (route)
- `apps/api/src/routes/devices.ts` (route)
- `apps/api/src/routes/discovery.ts` (route)
- `apps/api/src/routes/docs.ts` (route)
- `apps/api/src/routes/drift.ts` (route)
- `apps/api/src/routes/escalation.ts` (route)
- `apps/api/src/routes/executions.ts` (route)
- `apps/api/src/routes/finops.ts` (route)
- `apps/api/src/routes/firewall.ts` (route)
- `apps/api/src/routes/health.ts` (route)
- `apps/api/src/routes/itsm.ts` (route)
- `apps/api/src/routes/k8s.ts` (route)
- `apps/api/src/routes/lgpd.ts` (route)
- `apps/api/src/routes/logs.ts` (route)
- `apps/api/src/routes/marketplace.ts` (route)
- `apps/api/src/routes/metrics.ts` (route)
- `apps/api/src/routes/mfa.ts` (route)
- `apps/api/src/routes/monitoring.ts` (route)
- `apps/api/src/routes/notifications.ts` (route)
- `apps/api/src/routes/patches.ts` (route)
- `apps/api/src/routes/predictions.ts` (route)
- `apps/api/src/routes/profile.ts` (route)
- `apps/api/src/routes/push.ts` (route)
- `apps/api/src/routes/rbac.ts` (route)
- `apps/api/src/routes/reports.ts` (route)
- `apps/api/src/routes/scripts.ts` (route)
- `apps/api/src/routes/security-audit.ts` (route)
- `apps/api/src/routes/settings.ts` (route)
- `apps/api/src/routes/sla.ts` (route)
- `apps/api/src/routes/ssl.ts` (route)
- `apps/api/src/routes/status-page.ts` (route)
- `apps/api/src/routes/users.ts` (route)
- `apps/api/src/routes/workflows.ts` (route)
- `apps/api/src/routes/zabbix.ts` (route)
- `apps/web/app/(admin)/admin/onboarding/page.tsx` (route)
- `apps/web/app/(admin)/admin/page.tsx` (route)
- `apps/web/app/(admin)/admin/users/page.tsx` (route)
- `apps/web/app/(admin)/anomaly-detection/page.tsx` (route)
- `apps/web/app/(admin)/api-keys/page.tsx` (route)
- `apps/web/app/(admin)/apm/page.tsx` (route)
- `apps/web/app/(admin)/assets/page.tsx` (route)
- `apps/web/app/(admin)/auto-discovery/page.tsx` (route)
- `apps/web/app/(admin)/automation/scripts/page.tsx` (route)
- `apps/web/app/(admin)/backups/page.tsx` (route)
- `apps/web/app/(admin)/capacity/page.tsx` (route)
- `apps/web/app/(admin)/changes/page.tsx` (route)
- `apps/web/app/(admin)/chatops/page.tsx` (route)
- `apps/web/app/(admin)/client-portal/page.tsx` (route)
- `apps/web/app/(admin)/compliance/page.tsx` (route)

... (truncated to fit budget)