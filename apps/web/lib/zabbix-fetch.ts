const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  // AbortController para timeout — 15s padrão, redes instáveis não bloqueiam a UI
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  // Se o caller já passou um signal, respeita ambos
  const externalSignal = options?.signal;
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    let res = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });

    // Se o proxy renovou o token mas não pode refazer POST/PUT, refaz a request
    if (res.status === 401 && res.headers.get("X-Token-Refreshed") === "true") {
      // Novo controller para o retry
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), DEFAULT_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          ...options,
          credentials: "include",
          signal: retryController.signal,
        });
      } finally {
        clearTimeout(retryTimeoutId);
      }
    }

    if (!res.ok) {
      const raw = await res.text();
      let errJson: { error?: { code?: string; message?: string } } | null = null;
      try {
        errJson = JSON.parse(raw);
      } catch {
        // Resposta não é JSON (ex: página HTML do Next.js)
      }
      const message = errJson?.error?.message ?? `Erro ${res.status}`;
      throw new Error(message);
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
