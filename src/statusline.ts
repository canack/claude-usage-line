import { GREEN, RED, YELLOW, BLUE, MAGENTA, CYAN, DIM, RST, dim, colorByThreshold, ORG_COLORS, DEFAULT_ORG_COLOR_NAME } from './ansi.js';
import { renderBar } from './bar.js';
import { formatRemaining } from './time.js';
import { getGitBranch } from './git.js';
import { homedir } from 'os';
import { sep as pathSep } from 'path';
import type { StatuslineInput, BarStyle, JSONOutput, HiddenField, RateLimitBucket, ExtraUsageBucket } from './types.js';

interface ResolvedUsage {
  sesPct: number;
  fhBucket: RateLimitBucket | null;
  wkBucket: RateLimitBucket | null;
  orgBucket: ExtraUsageBucket | null;
}

function resolveUsage(input: StatuslineInput): ResolvedUsage {
  return {
    sesPct: Math.floor(input.context_window.used_percentage ?? 0),
    fhBucket: input.rate_limits?.five_hour ?? null,
    wkBucket: input.rate_limits?.seven_day ?? null,
    orgBucket: input.extra_usage ?? null,
  };
}

function shortenCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return '~';
  if (cwd.startsWith(home + pathSep)) return '~' + cwd.slice(home.length).replaceAll('\\', '/');
  return cwd;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin === 0) return ms > 0 ? '<1m' : '0m';
  if (totalMin < 60) return totalMin + 'm';
  const totalH = Math.floor(totalMin / 60);
  if (totalH < 24) {
    const m = totalMin % 60;
    return m > 0 ? `${totalH}h${m}m` : `${totalH}h`;
  }
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return h > 0 ? `${d}d${h}h` : `${d}d`;
}

function currencySymbol(code: string): string {
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  if (code === 'GBP') return '£';
  return code + ' ';
}

function formatMoney(cents: number, currency: string): string {
  return currencySymbol(currency) + Math.round(cents / 100);
}

function hasExtendedInput(input: StatuslineInput): boolean {
  return !!(input.cwd || input.model);
}

function buildExtras(input: StatuslineInput, hide: Set<HiddenField>): string[] {
  const parts: string[] = [];
  if (input.cost) {
    const { total_lines_added, total_lines_removed, total_cost_usd, total_duration_ms } = input.cost;
    if (!hide.has('diff') && (typeof total_lines_added === 'number' || typeof total_lines_removed === 'number')) {
      const added = total_lines_added ?? 0;
      const removed = total_lines_removed ?? 0;
      parts.push(GREEN + '+' + added + RST + ' ' + RED + '-' + removed + RST);
    }
    if (!hide.has('cost') && typeof total_cost_usd === 'number') {
      parts.push(YELLOW + '$' + total_cost_usd.toFixed(2) + RST);
    }
    if (!hide.has('duration') && typeof total_duration_ms === 'number' && total_duration_ms > 0) {
      parts.push(DIM + BLUE + '⏱ ' + formatDuration(total_duration_ms) + RST);
    }
  }
  return parts;
}

function renderOrgBar(bucket: ExtraUsageBucket, style: BarStyle, baseColor: string): string {
  const width = Math.min(40, Math.max(16, style.width * 2));
  const unlimited = bucket.monthly_limit_cents === 0;
  const pct = unlimited ? 0 : bucket.used_percentage;
  const color = colorByThreshold(pct, baseColor);
  const bar = renderBar(pct, baseColor, style, width);
  const used = formatMoney(bucket.used_credits_cents, bucket.currency);
  const moneyText = unlimited ? used + ' / ∞' : used + '/' + formatMoney(bucket.monthly_limit_cents, bucket.currency);
  const money = DIM + color + moneyText + RST;
  const reset = DIM + color + style.resetIcon + formatRemaining(bucket.resets_at) + RST;
  return 'Org ' + bar + ' ' + money + ' ' + reset;
}

function buildBarParts(style: BarStyle, usage: ResolvedUsage, hide: Set<HiddenField>, orgColor: string): string[] {
  const parts: string[] = ['Cx ' + renderBar(usage.sesPct, MAGENTA, style)];

  if (usage.orgBucket && !hide.has('org')) {
    parts.push(renderOrgBar(usage.orgBucket, style, orgColor));
    return parts;
  }

  if (!usage.fhBucket && !usage.wkBucket) return parts;

  const fhPct = Math.floor(usage.fhBucket?.used_percentage ?? 0);
  const wkPct = Math.floor(usage.wkBucket?.used_percentage ?? 0);
  const fhRemain = formatRemaining(usage.fhBucket?.resets_at);
  const wkRemain = formatRemaining(usage.wkBucket?.resets_at);
  parts.push(
    '5h ' + renderBar(fhPct, CYAN, style) + ' ' + DIM + CYAN + style.resetIcon + fhRemain + RST,
    '7d ' + renderBar(wkPct, GREEN, style) + ' ' + DIM + GREEN + style.resetIcon + wkRemain + RST,
  );
  return parts;
}

function renderBarsLine(input: StatuslineInput, style: BarStyle, usage: ResolvedUsage, hide: Set<HiddenField>, orgColor: string): string {
  const sep = ' ' + dim(style.separator) + ' ';
  const extras = buildExtras(input, hide);
  const bars = buildBarParts(style, usage, hide, orgColor).join(sep);

  if (extras.length === 0) return bars;
  return extras.join(sep) + '\n' + bars;
}

export function renderStatusline(input: StatuslineInput, style: BarStyle, hide: Set<HiddenField> = new Set(), orgColor: string = ORG_COLORS[DEFAULT_ORG_COLOR_NAME]): string {
  const usage = resolveUsage(input);

  if (!hasExtendedInput(input)) {
    return renderBarsLine(input, style, usage, hide, orgColor);
  }

  const sep = ' ' + dim(style.separator) + ' ';
  const showCwd = !hide.has('cwd') && !!input.cwd;
  const showBranch = !hide.has('branch') && !!input.cwd;
  const branch = showBranch ? getGitBranch(input.cwd!) : null;

  const line1Parts: string[] = [];
  if (showCwd) {
    let cwdPart = BLUE + shortenCwd(input.cwd!) + RST;
    if (branch) cwdPart += ' → ' + GREEN + branch + RST;
    line1Parts.push(cwdPart);
  } else if (branch) {
    line1Parts.push(GREEN + branch + RST);
  }
  line1Parts.push(...buildExtras(input, hide));

  const line2Parts: string[] = [];
  if (!hide.has('model') && input.model?.display_name) {
    line2Parts.push(MAGENTA + input.model.display_name + RST);
  }
  line2Parts.push(...buildBarParts(style, usage, hide, orgColor));

  const lines: string[] = [];
  if (line1Parts.length > 0) lines.push(line1Parts.join(sep));
  lines.push(line2Parts.join(sep));
  return lines.join('\n');
}

export function buildJSONOutput(input: StatuslineInput, hide: Set<HiddenField> = new Set()): JSONOutput {
  const usage = resolveUsage(input);
  const branch = !hide.has('branch') && input.cwd ? getGitBranch(input.cwd) : null;
  const fhPct = Math.floor(usage.fhBucket?.used_percentage ?? 0);
  const wkPct = Math.floor(usage.wkBucket?.used_percentage ?? 0);
  const orgPct = Math.floor(usage.orgBucket?.used_percentage ?? 0);

  return {
    model: !hide.has('model') ? (input.model?.display_name ?? null) : null,
    cwd: !hide.has('cwd') ? (input.cwd ?? null) : null,
    git_branch: branch,
    session: {
      utilization_pct: usage.sesPct,
      resets_at: null,
      remaining: '--',
    },
    five_hour: {
      utilization_pct: fhPct,
      resets_at: usage.fhBucket?.resets_at ?? null,
      remaining: formatRemaining(usage.fhBucket?.resets_at),
    },
    seven_day: {
      utilization_pct: wkPct,
      resets_at: usage.wkBucket?.resets_at ?? null,
      remaining: formatRemaining(usage.wkBucket?.resets_at),
    },
    org: !hide.has('org') && usage.orgBucket
      ? {
          utilization_pct: orgPct,
          used_usd: usage.orgBucket.used_credits_cents / 100,
          limit_usd: usage.orgBucket.monthly_limit_cents / 100,
          currency: usage.orgBucket.currency,
          resets_at: usage.orgBucket.resets_at,
          remaining: formatRemaining(usage.orgBucket.resets_at),
        }
      : {
          utilization_pct: 0,
          used_usd: null,
          limit_usd: null,
          currency: null,
          resets_at: null,
          remaining: '--',
        },
    diff: {
      added: !hide.has('diff') ? (input.cost?.total_lines_added ?? 0) : 0,
      removed: !hide.has('diff') ? (input.cost?.total_lines_removed ?? 0) : 0,
    },
    cost_usd: !hide.has('cost') ? (input.cost?.total_cost_usd ?? null) : null,
    duration_min: !hide.has('duration') && typeof input.cost?.total_duration_ms === 'number'
      ? Math.floor(input.cost.total_duration_ms / 60_000)
      : null,
  };
}
