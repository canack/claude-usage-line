#!/usr/bin/env node

process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

import { renderStatusline, buildJSONOutput } from './statusline.js';
import { runSetup } from './setup.js';
import { getStyle, styleNames, DEFAULT_STYLE } from './styles.js';
import { readCache, isCacheStale } from './cache.js';
import { spawnBackgroundFetch } from './usage-api.js';
import { resolveOrgColor, orgColorNames, DEFAULT_ORG_COLOR_NAME } from './ansi.js';
import type { StatuslineInput, HiddenField } from './types.js';

const VALID_HIDE_FIELDS = new Set<HiddenField>(['cost', 'diff', 'duration', 'model', 'cwd', 'branch', 'org']);

const STDIN_TIMEOUT = 3000;
const MAX_STDIN = 64 * 1024;

function parseBucket(raw: unknown): { used_percentage: number; resets_at: number } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const b = raw as Record<string, unknown>;
  const pct = typeof b.used_percentage === 'number' && Number.isFinite(b.used_percentage)
    ? Math.max(0, Math.min(100, b.used_percentage)) : null;
  const resets = typeof b.resets_at === 'number' && Number.isFinite(b.resets_at) ? b.resets_at : null;
  if (pct === null || resets === null) return undefined;
  return { used_percentage: pct, resets_at: resets };
}

function validateInput(raw: unknown): StatuslineInput {
  const fallback: StatuslineInput = { context_window: { used_percentage: 0 } };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;
  const ctx = obj.context_window as Record<string, unknown> | undefined;
  if (!ctx) return fallback;

  const pct = typeof ctx.used_percentage === 'number' && Number.isFinite(ctx.used_percentage)
    ? ctx.used_percentage : 0;

  const result: StatuslineInput = {
    context_window: { used_percentage: pct },
  };

  if (typeof obj.cwd === 'string' && obj.cwd.length > 0) {
    result.cwd = obj.cwd;
  }

  const model = obj.model as Record<string, unknown> | undefined;
  if (model && typeof model === 'object') {
    if (typeof model.display_name === 'string' && model.display_name.length > 0) {
      result.model = { display_name: model.display_name };
    }
  }

  const cost = obj.cost as Record<string, unknown> | undefined;
  if (cost && typeof cost === 'object') {
    result.cost = {};
    if (typeof cost.total_lines_added === 'number') result.cost.total_lines_added = cost.total_lines_added;
    if (typeof cost.total_lines_removed === 'number') result.cost.total_lines_removed = cost.total_lines_removed;
    if (typeof cost.total_cost_usd === 'number') result.cost.total_cost_usd = cost.total_cost_usd;
    if (typeof cost.total_duration_ms === 'number') result.cost.total_duration_ms = cost.total_duration_ms;
  }

  const rl = obj.rate_limits as Record<string, unknown> | undefined;
  if (rl && typeof rl === 'object') {
    result.rate_limits = {};
    const fh = parseBucket(rl.five_hour);
    const wk = parseBucket(rl.seven_day);
    if (fh) result.rate_limits.five_hour = fh;
    if (wk) result.rate_limits.seven_day = wk;
  }

  return result;
}

function applyOAuthFallback(input: StatuslineInput): StatuslineInput {
  if (input.rate_limits) return input;

  const cached = readCache();

  if (cached) {
    if (cached.five_hour || cached.seven_day) {
      input.rate_limits = {};
      if (cached.five_hour) input.rate_limits.five_hour = cached.five_hour;
      if (cached.seven_day) input.rate_limits.seven_day = cached.seven_day;
    }
    if (cached.extra_usage) {
      input.extra_usage = cached.extra_usage;
    }
  }

  if (process.env.CLAUDE_USAGE_LINE_NO_FETCH !== '1' && isCacheStale(cached)) {
    spawnBackgroundFetch();
  }

  return input;
}

function parseHide(raw: string): Set<HiddenField> {
  const result = new Set<HiddenField>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim() as HiddenField;
    if (VALID_HIDE_FIELDS.has(trimmed)) result.add(trimmed);
  }
  return result;
}

const SEPARATORS: Record<string, string> = {
  pipe: '│',
  bullet: '•',
};

function parseFlags(args: string[]): { json: boolean; styleName: string; hide: Set<HiddenField>; sep: string | null; orgColorName: string } {
  let json = false;
  let styleName = DEFAULT_STYLE;
  let hide = new Set<HiddenField>();
  let sep: string | null = null;
  let orgColorName = DEFAULT_ORG_COLOR_NAME;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--style' && i + 1 < args.length) {
      styleName = args[++i];
    } else if (arg.startsWith('--style=')) {
      styleName = arg.slice('--style='.length);
    } else if (arg === '--hide' && i + 1 < args.length) {
      hide = parseHide(args[++i]);
    } else if (arg.startsWith('--hide=')) {
      hide = parseHide(arg.slice('--hide='.length));
    } else if (arg === '--sep' && i + 1 < args.length) {
      sep = args[++i];
    } else if (arg.startsWith('--sep=')) {
      sep = arg.slice('--sep='.length);
    } else if (arg === '--org-color' && i + 1 < args.length) {
      orgColorName = args[++i];
    } else if (arg.startsWith('--org-color=')) {
      orgColorName = arg.slice('--org-color='.length);
    }
  }
  return { json, styleName, hide, sep, orgColorName };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  const timeout = setTimeout(() => {
    process.stderr.write('stdin timeout\n');
    process.exit(1);
  }, STDIN_TIMEOUT);
  for await (const chunk of process.stdin) {
    total += (chunk as Buffer).length;
    if (total > MAX_STDIN) {
      clearTimeout(timeout);
      process.exit(1);
    }
    chunks.push(chunk as Buffer);
  }
  clearTimeout(timeout);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      'Usage: claude-usage-line [options]\n' +
      '       claude-usage-line setup\n\n' +
      'Options:\n' +
      '  --style <name>      Bar style (classic, dot, braille, block, ascii, square, pipe)\n' +
      '  --hide <fields>     Hide fields: cost,diff,duration,model,cwd,branch,org\n' +
      '  --sep <name>        Separator style: bullet (default), pipe\n' +
      '  --org-color <name>  Org bar color (purple [default], teal, steel, gold, coral,\n' +
      '                      blue, magenta, cyan, yellow, green)\n' +
      '  --json              Output JSON\n' +
      '  --help              Show this help\n' +
      '  --version           Show version\n\n' +
      'Environment:\n' +
      '  CLAUDE_USAGE_LINE_NO_FETCH=1   Disable OAuth fetch fallback (Enterprise users)\n' +
      '  CLAUDE_CODE_OAUTH_TOKEN=<tok>  Override token source (one-shot)\n'
    );
    process.exit(0);
  }

  if (args.includes('--version')) {
    process.stdout.write(__VERSION__ + '\n');
    process.exit(0);
  }

  if (args[0] === 'setup') {
    runSetup();
    return;
  }

  const { json, styleName, hide, sep, orgColorName } = parseFlags(args);

  if (!json) {
    const style = getStyle(styleName);
    if (!style) {
      process.stderr.write(`Unknown style: ${styleName}\nAvailable: ${styleNames().join(', ')}\n`);
      process.exit(1);
    }
  }

  const orgColor = resolveOrgColor(orgColorName);
  if (!orgColor) {
    process.stderr.write(`Unknown org-color: ${orgColorName}\nAvailable: ${orgColorNames().join(', ')}\n`);
    process.exit(1);
  }

  const raw = await readStdin();
  let parsed: unknown = {};
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // invalid JSON — use defaults
    }
  }

  const input = applyOAuthFallback(validateInput(parsed));

  if (json) {
    process.stdout.write(JSON.stringify(buildJSONOutput(input, hide)) + '\n');
  } else {
    let style = getStyle(styleName)!;
    if (sep) {
      const resolved = SEPARATORS[sep] ?? sep;
      style = { ...style, separator: resolved };
    }
    process.stdout.write(renderStatusline(input, style, hide, orgColor) + '\n');
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.message ?? e) + '\n');
  process.exit(1);
});
