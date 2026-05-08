import { writeCache, releaseFetchLock } from './cache.js';
import type { CachedUsage, RateLimitBucket, ExtraUsageBucket } from './types.js';

setTimeout(() => process.exit(1), 15_000);

process.on('exit', () => releaseFetchLock());

const API_URL = 'https://api.anthropic.com/api/oauth/usage';
const MAX_STDIN = 8 * 1024;
const MAX_RESPONSE = 1024 * 1024;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function parseRateLimit(v: unknown): RateLimitBucket | null {
  if (typeof v !== 'object' || v === null) return null;
  const obj = v as Record<string, unknown>;
  const util = obj.utilization;
  const resets = obj.resets_at;
  if (typeof util !== 'number' || !Number.isFinite(util)) return null;
  if (typeof resets !== 'string') return null;
  const epoch = Date.parse(resets);
  if (isNaN(epoch)) return null;
  return {
    used_percentage: clampPct(util),
    resets_at: Math.floor(epoch / 1000),
  };
}

function endOfMonthUTC(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0) / 1000);
}

function parseExtraUsage(v: unknown): ExtraUsageBucket | null {
  if (typeof v !== 'object' || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (obj.is_enabled !== true) return null;
  const limit = obj.monthly_limit;
  const used = obj.used_credits;
  const util = obj.utilization;
  // monthly_limit === 0 is treated as "unlimited" (renderer adapts).
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) return null;
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) return null;
  if (typeof util !== 'number' || !Number.isFinite(util)) return null;
  const currency = typeof obj.currency === 'string' && obj.currency.length > 0 ? obj.currency : 'USD';
  return {
    used_percentage: limit === 0 ? 0 : clampPct(util),
    used_credits_cents: used,
    monthly_limit_cents: limit,
    currency,
    resets_at: endOfMonthUTC(),
  };
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += (chunk as Buffer).length;
    if (total > MAX_STDIN) process.exit(1);
    chunks.push(chunk as Buffer);
  }
  const token = Buffer.concat(chunks).toString('utf-8').trim();
  if (!token) process.exit(1);

  const resp = await fetch(API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': `claude-usage-line/${__VERSION__}`,
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });

  if (!resp.ok) process.exit(1);

  const text = await resp.text();
  if (text.length > MAX_RESPONSE) process.exit(1);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    process.exit(1);
  }

  const obj = body as Record<string, unknown>;
  const cached: CachedUsage = {
    five_hour: parseRateLimit(obj.five_hour),
    seven_day: parseRateLimit(obj.seven_day),
    extra_usage: parseExtraUsage(obj.extra_usage),
    fetched_at: Date.now() / 1000,
  };

  if (!cached.five_hour && !cached.seven_day && !cached.extra_usage) process.exit(1);
  writeCache(cached);
}

main().catch(() => process.exit(1));
