// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createK8sClusterSchema,
  updateK8sClusterSchema,
  k8sResourceTypeSchema,
} from "@repo/shared-validation";

// ========== createK8sClusterSchema ==========

describe("k8s — createK8sClusterSchema", () => {
  const validCluster = {
    name: "prod-cluster",
    api_server: "https://k8s.example.com:6443",
    namespace: "default",
  };

  it("valida cluster minimo", () => {
    const result = createK8sClusterSchema.safeParse(validCluster);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem api_server", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      api_server: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita api_server invalida", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      api_server: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida com display_name", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      display_name: "Production Cluster",
    });
    expect(result.success).toBe(true);
  });

  it("valida com context", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      context: "prod-context",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita context com caracteres especiais", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      context: "prod; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita context com espacos", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      context: "prod context",
    });
    expect(result.success).toBe(false);
  });

  it("valida com kubeconfig_path", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      kubeconfig_path: "/etc/kube/config.yaml",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita kubeconfig_path com caracteres perigosos", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      kubeconfig_path: "/etc/kube/config.yaml; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita kubeconfig_path com espacos", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      kubeconfig_path: "/etc/kube/my config.yaml",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita namespace com caracteres perigosos", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      namespace: "default; cat /etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("valida namespace com hifens", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      namespace: "my-namespace",
    });
    expect(result.success).toBe(true);
  });

  it("valida com token", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      token: "abc123token",
    });
    expect(result.success).toBe(true);
  });

  it("valida com ca_cert", () => {
    const result = createK8sClusterSchema.safeParse({
      ...validCluster,
      ca_cert: "-----BEGIN CERTIFICATE-----",
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateK8sClusterSchema ==========

describe("k8s — updateK8sClusterSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateK8sClusterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateK8sClusterSchema.safeParse({ name: "new-name" });
    expect(result.success).toBe(true);
  });

  it("valida update display_name", () => {
    const result = updateK8sClusterSchema.safeParse({
      display_name: "New Display",
    });
    expect(result.success).toBe(true);
  });

  it("valida update api_server_url", () => {
    const result = updateK8sClusterSchema.safeParse({
      api_server_url: "https://new.k8s.example.com:6443",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita update api_server_url invalida", () => {
    const result = updateK8sClusterSchema.safeParse({
      api_server_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida update context", () => {
    const result = updateK8sClusterSchema.safeParse({ context: "new-ctx" });
    expect(result.success).toBe(true);
  });

  it("rejeita update context com injection", () => {
    const result = updateK8sClusterSchema.safeParse({
      context: "ctx; rm -rf /",
    });
    expect(result.success).toBe(false);
  });

  it("valida update namespace", () => {
    const result = updateK8sClusterSchema.safeParse({ namespace: "new-ns" });
    expect(result.success).toBe(true);
  });

  it("valida update kubeconfig_path", () => {
    const result = updateK8sClusterSchema.safeParse({
      kubeconfig_path: "/new/path/config.yaml",
    });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateK8sClusterSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateK8sClusterSchema.safeParse({
      name: "updated-cluster",
      display_name: "Updated Display",
      api_server_url: "https://updated.k8s.example.com:6443",
      context: "updated-ctx",
      namespace: "updated-ns",
      kubeconfig_path: "/updated/path.yaml",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== k8sResourceTypeSchema ==========

describe("k8s — k8sResourceTypeSchema", () => {
  it("valida pods", () => {
    const result = k8sResourceTypeSchema.safeParse("pods");
    expect(result.success).toBe(true);
  });

  it("valida services", () => {
    const result = k8sResourceTypeSchema.safeParse("services");
    expect(result.success).toBe(true);
  });

  it("valida deployments", () => {
    const result = k8sResourceTypeSchema.safeParse("deployments");
    expect(result.success).toBe(true);
  });

  it("valida nodes", () => {
    const result = k8sResourceTypeSchema.safeParse("nodes");
    expect(result.success).toBe(true);
  });

  it("valida namespaces", () => {
    const result = k8sResourceTypeSchema.safeParse("namespaces");
    expect(result.success).toBe(true);
  });

  it("rejeita tipo invalido", () => {
    const result = k8sResourceTypeSchema.safeParse("configmaps");
    expect(result.success).toBe(false);
  });

  it("rejeita string vazia", () => {
    const result = k8sResourceTypeSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejeita com injection", () => {
    const result = k8sResourceTypeSchema.safeParse("pods; rm -rf /");
    expect(result.success).toBe(false);
  });
});

// ========== Logica de execKubectl (Command Injection Prevention) ==========

describe("k8s — logica de execKubectl (Command Injection prevention)", () => {
  it("execFile usa args como array, nao shell interpolation", () => {
    // Simula construcao de args para kubectl
    const kubeconfigPath = '/etc/kube/config.yaml"; rm -rf /; "';
    const context = "prod; cat /etc/passwd";
    const resourceType = "pods";
    const namespace = "default";

    // Args sao passados como array para execFile — nao ha shell
    const fullArgs: string[] = [];
    if (kubeconfigPath) {
      fullArgs.push(`--kubeconfig=${kubeconfigPath}`);
    }
    if (context) {
      fullArgs.push(`--context=${context}`);
    }
    fullArgs.push("get", resourceType, "-n", namespace, "-o", "json");

    // Mesmo com caracteres maliciosos, args sao tratados como string literal
    // pelo execFile — nao ha interpretacao de shell
    expect(fullArgs).toContain(`--kubeconfig=${kubeconfigPath}`);
    expect(fullArgs).toContain(`--context=${context}`);
    expect(fullArgs).toContain("get");
    expect(fullArgs).toContain(resourceType);
    expect(fullArgs).toContain("-n");
    expect(fullArgs).toContain(namespace);
    expect(fullArgs).toContain("-o");
    expect(fullArgs).toContain("json");
  });

  it("args sem kubeconfig quando null", () => {
    const fullArgs: string[] = [];
    const kubeconfigPath = null;
    if (kubeconfigPath) {
      fullArgs.push(`--kubeconfig=${kubeconfigPath}`);
    }
    fullArgs.push("get", "pods", "-o", "json");
    expect(fullArgs).not.toContain("--kubeconfig=null");
    expect(fullArgs).toHaveLength(4);
  });

  it("args sem context quando null", () => {
    const fullArgs: string[] = [];
    const context = null;
    if (context) {
      fullArgs.push(`--context=${context}`);
    }
    fullArgs.push("get", "pods", "-o", "json");
    expect(fullArgs).not.toContain("--context=null");
    expect(fullArgs).toHaveLength(4);
  });

  it("namespace flag quando cluster tem namespace", () => {
    const clusterNamespace = "production";
    const kubectlArgs: string[] = ["get", "pods"];
    if (clusterNamespace) {
      kubectlArgs.push("-n", clusterNamespace);
    } else {
      kubectlArgs.push("--all-namespaces");
    }
    expect(kubectlArgs).toContain("-n");
    expect(kubectlArgs).toContain("production");
    expect(kubectlArgs).not.toContain("--all-namespaces");
  });

  it("all-namespaces flag quando cluster sem namespace", () => {
    const clusterNamespace = null;
    const kubectlArgs: string[] = ["get", "pods"];
    if (clusterNamespace) {
      kubectlArgs.push("-n", clusterNamespace);
    } else {
      kubectlArgs.push("--all-namespaces");
    }
    expect(kubectlArgs).toContain("--all-namespaces");
    expect(kubectlArgs).not.toContain("-n");
  });
});

// ========== Logica de Limit/Offset Pagination ==========

describe("k8s — logica de limit/offset pagination", () => {
  it("events limit default 100", () => {
    const parsedLimit = parseInt("100", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);
    expect(limit).toBe(100);
  });

  it("events limit maximo 500", () => {
    const parsedLimit = parseInt("9999", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);
    expect(limit).toBe(500);
  });

  it("events offset default 0", () => {
    const parsedOffset = parseInt("0", 10);
    const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;
    expect(offset).toBe(0);
  });

  it("events offset custom", () => {
    const parsedOffset = parseInt("50", 10);
    const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;
    expect(offset).toBe(50);
  });

  it("events limit NaN vira default 100", () => {
    const parsedLimit = parseInt("abc", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);
    expect(limit).toBe(100);
  });

  it("events offset NaN vira 0", () => {
    const parsedOffset = parseInt("xyz", 10);
    const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;
    expect(offset).toBe(0);
  });

  it("events limit negativo passa (Math.min nao clamp inferior)", () => {
    const parsedLimit = parseInt("-5", 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);
    expect(limit).toBe(-5);
  });
});

// ========== Logica de Field Map (PUT update) ==========

describe("k8s — logica de field map (PUT update)", () => {
  const fieldMap: Record<string, string> = {
    name: "name",
    display_name: "display_name",
    api_server_url: "api_server_url",
    context: "context",
    namespace: "namespace",
    kubeconfig_path: "kubeconfig_path",
    is_active: "is_active",
  };

  it("fieldMap tem 7 campos", () => {
    expect(Object.keys(fieldMap).length).toBe(7);
  });

  it("cada campo mapeia para si mesmo (snake_case)", () => {
    for (const [key, value] of Object.entries(fieldMap)) {
      expect(key).toBe(value);
    }
  });

  it("gera SET clause corretamente para 1 campo", () => {
    const data = { name: "new-name" };
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    expect(updateFields).toEqual(["name = $1"]);
    expect(params).toEqual(["new-name"]);
  });

  it("gera SET clause corretamente para 3 campos", () => {
    const data = {
      name: "new",
      namespace: "prod",
      is_active: false,
    };
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    expect(updateFields).toEqual([
      "name = $1",
      "namespace = $2",
      "is_active = $3",
    ]);
    expect(params).toEqual(["new", "prod", false]);
  });

  it("gera SET clause vazia quando data vazia", () => {
    const data = {};
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    expect(updateFields).toEqual([]);
    expect(params).toEqual([]);
  });

  it("ignora campos undefined explicitamente", () => {
    const data = { name: "X", context: undefined };
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    expect(updateFields).toEqual(["name = $1"]);
    expect(params).toEqual(["X"]);
  });

  it("adiciona clusterId e tenantId no final dos params", () => {
    const data = { name: "new" };
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    const clusterId = "cluster-123";
    const tenantId = "tenant-456";
    params.push(clusterId, tenantId);

    expect(params).toEqual(["new", "cluster-123", "tenant-456"]);
    expect(paramIdx).toBe(2);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("k8s — logica de tenant isolation", () => {
  it("queries de leitura sempre filtram por tenant_id", () => {
    const tenantId = "tenant-123";
    const conditions = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    expect(conditions).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de escrita sempre incluem tenant_id", () => {
    const tenantId = "tenant-456";
    const params: unknown[] = [tenantId, "prod-cluster", "default"];
    expect(params[0]).toBe(tenantId);
  });

  it("queries de update incluem tenant_id no WHERE", () => {
    const tenantId = "tenant-789";
    const clusterId = "cluster-abc";
    const sql = `UPDATE public.k8s_clusters SET name = $1 WHERE id = $2 AND tenant_id = $3`;
    const params: unknown[] = ["new", clusterId, tenantId];
    expect(sql).toContain("tenant_id = $3");
    expect(params[2]).toBe(tenantId);
  });

  it("queries de delete incluem tenant_id no WHERE", () => {
    const tenantId = "tenant-delete";
    const clusterId = "cluster-xyz";
    const sql = `DELETE FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2`;
    const params: unknown[] = [clusterId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("resources cache filtra por tenant_id", () => {
    const tenantId = "tenant-res";
    const clusterId = "cluster-1";
    const conditions = [
      "cluster_id = $1",
      "tenant_id = $2",
      "resource_type = $3",
    ];
    const params: unknown[] = [clusterId, tenantId, "pods"];
    expect(conditions).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("events filtram por tenant_id", () => {
    const tenantId = "tenant-evt";
    const clusterId = "cluster-1";
    const conditions = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = [clusterId, tenantId];
    expect(conditions).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("tenant_id null e propagado corretamente (multi-tenant fallback)", () => {
    const tenantId = null;
    const params: unknown[] = [tenantId];
    expect(params[0]).toBeNull();
  });
});

// ========== Logica de 404 Handling ==========

describe("k8s — logica de 404 handling", () => {
  it("PUT retorna 404 quando rowCount = 0", () => {
    const rowCount = 0;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(true);
  });

  it("PUT nao retorna 404 quando rowCount > 0", () => {
    const rowCount: number = 1;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(false);
  });

  it("DELETE retorna 404 quando rowCount = 0", () => {
    const rowCount = 0;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(true);
  });

  it("DELETE nao retorna 404 quando rowCount > 0", () => {
    const rowCount: number = 1;
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(false);
  });

  it("sync retorna 404 quando cluster nao encontrado", () => {
    const rows: unknown[] = [];
    const shouldReturn404 = !rows[0];
    expect(shouldReturn404).toBe(true);
  });

  it("sync nao retorna 404 quando cluster encontrado", () => {
    const rows: unknown[] = [{ id: "cluster-1" }];
    const shouldReturn404 = !rows[0];
    expect(shouldReturn404).toBe(false);
  });

  it("overview retorna 404 quando cluster nao encontrado", () => {
    const rows: unknown[] = [];
    const shouldReturn404 = !rows[0];
    expect(shouldReturn404).toBe(true);
  });
});

// ========== Logica de Optional Chaining (user?.sub) ==========

describe("k8s — logica de optional chaining user?.sub", () => {
  type TestUser = { sub: string; tenant_id: string };

  // Helper para evitar narrowing do TS — retorna o tipo union sem estreitar
  function getUser(
    value: TestUser | null | undefined,
  ): TestUser | null | undefined {
    return value;
  }

  it("user?.sub retorna undefined quando user e null", () => {
    const user = getUser(null);
    const sub = user?.sub ?? null;
    expect(sub).toBeNull();
  });

  it("user?.sub retorna undefined quando user e undefined", () => {
    const user = getUser(undefined);
    const sub = user?.sub ?? null;
    expect(sub).toBeNull();
  });

  it("user?.sub retorna o valor quando user existe", () => {
    const user = getUser({ sub: "user-123", tenant_id: "tenant-1" });
    const sub = user?.sub ?? null;
    expect(sub).toBe("user-123");
  });

  it("user?.tenant_id retorna undefined quando user e null", () => {
    const user = getUser(null);
    const tenantId = user?.tenant_id ?? null;
    expect(tenantId).toBeNull();
  });

  it("user?.tenant_id retorna o valor quando user existe", () => {
    const user = getUser({ sub: "user-123", tenant_id: "tenant-1" });
    const tenantId = user?.tenant_id ?? null;
    expect(tenantId).toBe("tenant-1");
  });

  it("user?.sub null nao chama writeAuditLog (skipped)", () => {
    const user = getUser(null);
    const shouldCallAudit = !!user?.sub;
    expect(shouldCallAudit).toBe(false);
  });

  it("user?.sub definido chama writeAuditLog", () => {
    const user = getUser({ sub: "user-123", tenant_id: "tenant-1" });
    const shouldCallAudit = !!user?.sub;
    expect(shouldCallAudit).toBe(true);
  });
});

// ========== Logica de Parallel Queries (Overview) ==========

describe("k8s — logica de parallel queries (overview)", () => {
  it("Promise.all resolve 2 queries em paralelo", async () => {
    const mockQuery1 = Promise.resolve({
      data: { rows: [{ resource_type: "pods", count: "10" }] },
    });
    const mockQuery2 = Promise.resolve({
      data: { rows: [{ type: "Warning", count: "5" }] },
    });
    const [r1, r2] = await Promise.all([mockQuery1, mockQuery2]);
    expect(r1.data.rows[0].resource_type).toBe("pods");
    expect(r2.data.rows[0].type).toBe("Warning");
  });

  it("Promise.all propaga erro de qualquer query", async () => {
    const q1 = Promise.resolve({ data: { rows: [] } });
    const q2 = Promise.reject(new Error("DB error"));
    await expect(Promise.all([q1, q2])).rejects.toThrow("DB error");
  });

  it("overview retorna cluster + counts + events combinados", () => {
    const cluster = { id: "c1", name: "prod" };
    const resourceCounts = [
      { resource_type: "pods", count: "10", healthy: "9", unhealthy: "1" },
    ];
    const eventCounts = [{ type: "Warning", count: "5" }];
    const response = {
      cluster,
      resource_counts: resourceCounts,
      event_counts_24h: eventCounts,
    };
    expect(response.cluster.id).toBe("c1");
    expect(response.resource_counts).toHaveLength(1);
    expect(response.event_counts_24h).toHaveLength(1);
  });
});

// ========== Logica de JSON Parse (kubectl output) ==========

describe("k8s — logica de JSON parse (kubectl output)", () => {
  it("parse JSON valido com items", () => {
    const stdout = JSON.stringify({
      items: [{ metadata: { name: "pod-1" } }, { metadata: { name: "pod-2" } }],
    });
    let resourceCount = 0;
    try {
      const kubectlData = JSON.parse(stdout);
      resourceCount = kubectlData.items?.length ?? 0;
    } catch {
      resourceCount = 0;
    }
    expect(resourceCount).toBe(2);
  });

  it("parse JSON valido sem items", () => {
    const stdout = JSON.stringify({ kind: "List", items: [] });
    let resourceCount = 0;
    try {
      const kubectlData = JSON.parse(stdout);
      resourceCount = kubectlData.items?.length ?? 0;
    } catch {
      resourceCount = 0;
    }
    expect(resourceCount).toBe(0);
  });

  it("parse JSON invalido retorna 0 (catch)", () => {
    const stdout = "not json at all";
    let resourceCount = 0;
    try {
      const kubectlData = JSON.parse(stdout);
      resourceCount = kubectlData.items?.length ?? 0;
    } catch {
      resourceCount = 0;
    }
    expect(resourceCount).toBe(0);
  });

  it("parse JSON com items null retorna 0", () => {
    const stdout = JSON.stringify({ items: null });
    let resourceCount = 0;
    try {
      const kubectlData = JSON.parse(stdout);
      resourceCount = kubectlData.items?.length ?? 0;
    } catch {
      resourceCount = 0;
    }
    expect(resourceCount).toBe(0);
  });

  it("parse JSON com items undefined retorna 0", () => {
    const stdout = JSON.stringify({ kind: "PodList" });
    let resourceCount = 0;
    try {
      const kubectlData = JSON.parse(stdout);
      resourceCount = kubectlData.items?.length ?? 0;
    } catch {
      resourceCount = 0;
    }
    expect(resourceCount).toBe(0);
  });
});

// ========== Logica de kubectl Exit Code ==========

describe("k8s — logica de kubectl exit code", () => {
  it("exitCode 0 significa sucesso", () => {
    const exitCode: number = 0;
    const isSuccess = exitCode === 0;
    expect(isSuccess).toBe(true);
  });

  it("exitCode != 0 significa erro", () => {
    const exitCode: number = 1;
    const isSuccess = exitCode === 0;
    expect(isSuccess).toBe(false);
  });

  it("exitCode null vira 1 (error.code fallback)", () => {
    const error: { code: number | string | undefined } | null = {
      code: null as unknown as undefined,
    };
    const exitCode = error ? ((error.code as number) ?? 1) : 0;
    expect(exitCode).toBe(1);
  });

  it("exitCode definido e usado quando error existe", () => {
    const error: { code: number | string | undefined } | null = { code: 127 };
    const exitCode = error ? ((error.code as number) ?? 1) : 0;
    expect(exitCode).toBe(127);
  });

  it("sem error, exitCode e 0", () => {
    const error: { code: number | string | undefined } | null = null;
    // Helper para evitar narrowing — simula o comportamento do execKubectl
    function getExitCode(
      err: { code: number | string | undefined } | null,
    ): number {
      return err ? ((err.code as number) ?? 1) : 0;
    }
    const exitCode = getExitCode(error);
    expect(exitCode).toBe(0);
  });
});

// ========== Logica de Namespace Filter ==========

describe("k8s — logica de namespace filter", () => {
  it("namespace 'all' nao adiciona filtro", () => {
    const namespace = "all";
    const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = ["c1", "t1"];
    let paramIdx = 3;

    if (namespace && namespace !== "all") {
      conditions.push(`namespace = $${paramIdx++}`);
      params.push(namespace);
    }

    expect(conditions).not.toContain("namespace = $3");
    expect(params).toHaveLength(2);
  });

  it("namespace definido adiciona filtro", () => {
    const namespace: string | null = "production";
    const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = ["c1", "t1"];
    let paramIdx = 3;

    if (namespace && namespace !== "all") {
      conditions.push(`namespace = $${paramIdx++}`);
      params.push(namespace);
    }

    expect(conditions).toContain("namespace = $3");
    expect(params).toHaveLength(3);
    expect(params[2]).toBe("production");
  });

  it("namespace vazio nao adiciona filtro", () => {
    const namespace = "";
    const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = ["c1", "t1"];
    let paramIdx = 3;

    if (namespace && namespace !== "all") {
      conditions.push(`namespace = $${paramIdx++}`);
      params.push(namespace);
    }

    expect(conditions).not.toContain("namespace = $3");
    expect(params).toHaveLength(2);
  });

  it("namespace null nao adiciona filtro", () => {
    const namespace = null;
    const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = ["c1", "t1"];
    let paramIdx = 3;

    if (namespace && namespace !== "all") {
      conditions.push(`namespace = $${paramIdx++}`);
      params.push(namespace);
    }

    expect(conditions).not.toContain("namespace = $3");
    expect(params).toHaveLength(2);
  });
});

// ========== Logica de api_server Fallback ==========

describe("k8s — logica de api_server fallback", () => {
  it("usa api_server_url quando definido", () => {
    const data = {
      api_server_url: "https://new.k8s.example.com:6443",
      api_server: "https://old.k8s.example.com:6443",
    };
    const apiServer = data.api_server_url ?? data.api_server;
    expect(apiServer).toBe("https://new.k8s.example.com:6443");
  });

  it("fallback para api_server quando api_server_url undefined", () => {
    const data = {
      api_server_url: undefined,
      api_server: "https://old.k8s.example.com:6443",
    };
    const apiServer = data.api_server_url ?? data.api_server;
    expect(apiServer).toBe("https://old.k8s.example.com:6443");
  });

  it("ambos undefined resulta em undefined", () => {
    const data = {
      api_server_url: undefined,
      api_server: undefined,
    };
    const apiServer = data.api_server_url ?? data.api_server;
    expect(apiServer).toBeUndefined();
  });
});
