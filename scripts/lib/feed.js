// lib/feed.js — fetch JSON with timeout/retry；代理依赖 Node 官方 env-proxy（NODE_USE_ENV_PROXY=1 + HTTPS_PROXY/HTTP_PROXY）
export async function fetchJson(url, { timeoutMs = 10000, retries = 1, headers } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'free-llm-tokens/0.1 (+https://github.com/msz-legend/free-llm-tokens)', ...(headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) { const e = new Error(`404 not found: ${url}`); e.status = 404; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.status === 404) break; // 404 不重试
    }
  }
  throw lastErr;
}

/** 代理可达预检：返回 {ok, ms, err}，用于 refresh 前的网络分级 */
export async function ping(url, { timeoutMs = 6000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    return { ok: res.status < 500, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: String(e?.cause?.code ?? e.message).slice(0, 120) };
  }
}
