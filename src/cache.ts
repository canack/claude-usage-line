import { readFileSync, renameSync, mkdirSync, unlinkSync, statSync, openSync, writeSync, closeSync, lstatSync, constants } from 'fs';
import { dirname } from 'path';
import { getCachePath } from './platform.js';
import type { CachedUsage, RateLimitBucket, ExtraUsageBucket } from './types.js';

const CACHE_TTL = 300;
const LOCK_TTL = 30_000;

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

function safeWriteExclusive(path: string, data: string, mode: number): void {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW, mode);
  try { writeSync(fd, data); } finally { closeSync(fd); }
}

export function isRateLimitBucket(v: unknown): v is RateLimitBucket {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.used_percentage === 'number'
    && Number.isFinite(obj.used_percentage)
    && typeof obj.resets_at === 'number'
    && Number.isFinite(obj.resets_at);
}

export function isExtraUsageBucket(v: unknown): v is ExtraUsageBucket {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.used_percentage === 'number'
    && Number.isFinite(obj.used_percentage)
    && typeof obj.used_credits_cents === 'number'
    && Number.isFinite(obj.used_credits_cents)
    && typeof obj.monthly_limit_cents === 'number'
    && Number.isFinite(obj.monthly_limit_cents)
    && typeof obj.currency === 'string'
    && typeof obj.resets_at === 'number'
    && Number.isFinite(obj.resets_at);
}

function validateCached(raw: unknown): CachedUsage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.fetched_at !== 'number') return null;
  return {
    five_hour: isRateLimitBucket(obj.five_hour) ? obj.five_hour : null,
    seven_day: isRateLimitBucket(obj.seven_day) ? obj.seven_day : null,
    extra_usage: isExtraUsageBucket(obj.extra_usage) ? obj.extra_usage : null,
    fetched_at: obj.fetched_at,
  };
}

export function readCache(): CachedUsage | null {
  try {
    const data = readFileSync(getCachePath(), 'utf-8');
    const parsed = JSON.parse(data);
    return validateCached(parsed);
  } catch {
    return null;
  }
}

export function isCacheStale(cached: CachedUsage | null): boolean {
  if (!cached) return true;
  const now = Date.now() / 1000;
  if ((now - cached.fetched_at) >= CACHE_TTL) return true;
  if (cached.extra_usage && cached.extra_usage.resets_at <= now) return true;
  return false;
}

export function writeCache(usage: CachedUsage): void {
  const cachePath = getCachePath();
  mkdirSync(dirname(cachePath), { recursive: true, mode: 0o700 });
  const tmp = cachePath + '.' + process.pid + '.tmp';
  try { unlinkSync(tmp); } catch {}
  safeWriteExclusive(tmp, JSON.stringify(usage), 0o600);
  renameSync(tmp, cachePath);
}

function getLockPath(): string {
  return getCachePath() + '.lock';
}

export function acquireFetchLock(): boolean {
  const lockPath = getLockPath();
  try {
    const st = statSync(lockPath);
    if (Date.now() - st.mtimeMs > LOCK_TTL) {
      try { unlinkSync(lockPath); } catch {}
    } else {
      return false;
    }
  } catch {}

  try {
    mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
    safeWriteExclusive(lockPath, String(process.pid), 0o600);
    return true;
  } catch { return false; }
}

export function releaseFetchLock(): void {
  try {
    const lockPath = getLockPath();
    const st = lstatSync(lockPath);
    if (st.isSymbolicLink()) return;
    const content = readFileSync(lockPath, 'utf-8').trim();
    if (content === String(process.pid)) unlinkSync(lockPath);
  } catch {}
}
