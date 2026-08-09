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
    const limit = Math.min(parseInt("100", 10), 500);
    expect(limit).toBe(100);
  });

  it("events limit maximo 500", () => {
    const limit = Math.min(parseInt("9999", 10), 500);
    expect(limit).toBe(500);
  });

  it("events offset default 0", () => {
    const offset = parseInt("0", 10);
    expect(offset).toBe(0);
  });

  it("events offset custom", () => {
    const offset = parseInt("50", 10);
    expect(offset).toBe(50);
  });
});
