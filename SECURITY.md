# Política de Segurança

## Versões Suportadas

| Versão | Suporte          |
| ------ | ---------------- |
| 1.0.x  | ✅ Suportada     |
| < 1.0  | ❌ Não suportada |

## Reportar Vulnerabilidade

Agradecemos relatos de vulnerabilidades de segurança!

1. **NÃO** abra uma issue pública.
2. Envie um email para `security@jlinformatica.com.br` com:
   - Descrição da vulnerabilidade
   - Passos para reproduzir
   - Impacto estimado
   - Sugestão de correção (se aplicável)
3. Responderemos em até 48 horas.
4. Trabalharemos juntos para correção e disclosure responsável.

## Medidas de Segurança do JLMIRROR

- **Row Level Security (RLS)** obrigatório em todas as tabelas PostgreSQL
- **CSP** (Content Security Policy) configurada no `next.config.mjs`
- **Headers de segurança**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Redação automática de PII** no logger (pino)
- **Variáveis de ambiente** nunca commitadas (`.gitignore` + `.env.example`)
- **ESLint com plugin de segurança** (`eslint-plugin-security`)
- **Dependabot** ativo para monitorar vulnerabilidades
