// Helper goi HTTP JSON co timeout (dung global fetch cua Node 20+).

export async function getJson<T = any>(
  base: string,
  pathname: string,
  params: Record<string, string | number | boolean> = {},
  timeoutMs = 30000
): Promise<T> {
  const url = new URL(pathname, base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url.pathname}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
