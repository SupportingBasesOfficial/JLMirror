# EAS Build - Guia e Estratégia de Créditos

## Cota do Plano Gratuito

- **15 builds/mês** no plano gratuito
- O crédito é descontado assim que o servidor inicia a compilação
- Falhas após 3 min **consomem** 1 crédito
- Falhas rápidas (antes de 3 min) **não consomem** (até 10/mês)

## Estratégia para Economizar Créditos

### 1. Sempre testar local primeiro

```bash
# Nao consome credito - roda Gradle na maquina local
eas build --platform android --profile apk --local
```

### 2. Só subir para EAS cloud quando o local passar

```bash
# Consome 1 credito
eas build --platform android --profile apk
```

### 3. Fluxo recomendado

| Cenario                       | Abordagem             | Custo      |
| ----------------------------- | --------------------- | ---------- |
| Debugando config/dependencias | `--local`             | 0 creditos |
| Testar se build funciona      | `--local` primeiro    | 0 creditos |
| Build final para distribuir   | EAS cloud             | 1 credito  |
| APK para teste rapido         | `--local` se possivel | 0 creditos |

## Requisitos para Build Local

- Android SDK instalado
- Java 17+ (JDK)
- Variaveis de ambiente: ANDROID_HOME, JAVA_HOME

## Profiles Disponiveis (eas.json)

- **development**: dev client, distribution internal
- **apk**: APK build, distribution internal (para teste direto no celular)
- **staging**: AAB, distribution internal, env staging
- **production**: AAB, autoIncrement, env producao (para Play Store)

## Licao Aprendida

Builds falhados por erros de configuracao (pnpm hoisting, babel, autolinking) consumiram ~3 creditos antes de encontrar o fix definitivo (`node-linker=hoisted` no `.npmrc`). Sempre validar com `--local` antes de disparar builds cloud.
