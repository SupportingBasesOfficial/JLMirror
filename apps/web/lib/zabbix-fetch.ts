// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
const DEFAULT_TIMEOUT_MS = 15_000;

type ProgressCallback = (progress: number) => void;

async function doFetch(
  url: string,
  options: RequestInit | undefined,
  controller: AbortController,
): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    credentials: "include",
    signal: controller.signal,
  });

  // Se o proxy renovou o token mas nao pode refazer POST/PUT, refaz a request
  if (res.status === 401 && res.headers.get("X-Token-Refreshed") === "true") {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });
  }

  return res;
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const externalSignal = options?.signal;
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await doFetch(url, options, controller);

    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = "/auth/login";
        throw new Error("Sessão expirada");
      }
      const raw = await res.text();
      let errJson: { error?: { code?: string; message?: string } } | null =
        null;
      try {
        errJson = JSON.parse(raw);
      } catch {
        // Resposta nao e JSON
      }
      const message = errJson?.error?.message ?? `Erro ${res.status}`;
      const code = errJson?.error?.code;
      // Inclui status code e code na mensagem para permitir checks no onErrorRetry
      const error = new Error(
        code
          ? `[${res.status} ${code}] ${message}`
          : `[${res.status}] ${message}`,
      );
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tempo limite excedido (15s). Verifique sua conexão.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch com progresso real baseado em bytes baixados vs Content-Length
// onProgress recebe valor 0-100. Se o servidor nao enviar Content-Length,
// usa um estimador baseado em tempo + chunks recebidos.
export async function apiFetchWithProgress<T>(
  url: string,
  options: RequestInit | undefined,
  onProgress: ProgressCallback,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const externalSignal = options?.signal;
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await doFetch(url, options, controller);

    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = "/auth/login";
        throw new Error("Sessão expirada");
      }
      const raw = await res.text();
      let errJson: { error?: { code?: string; message?: string } } | null =
        null;
      try {
        errJson = JSON.parse(raw);
      } catch {
        // Resposta nao e JSON
      }
      const message = errJson?.error?.message ?? `Erro ${res.status}`;
      const code = errJson?.error?.code;
      const error = new Error(
        code
          ? `[${res.status} ${code}] ${message}`
          : `[${res.status}] ${message}`,
      );
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }

    const contentLength = res.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!res.body || !total) {
      // Sem stream ou sem Content-Length — fallback: json direto, progresso salta para 100
      onProgress(100);
      return res.json() as Promise<T>;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        const pct = Math.min(99, Math.round((received / total) * 100));
        onProgress(pct);
      }
    }

    onProgress(100);

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const text = new TextDecoder().decode(merged);
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tempo limite excedido (15s). Verifique sua conexão.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
