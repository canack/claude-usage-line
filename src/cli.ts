#!/usr/bin/env node

process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

import { renderStatusline, buildJSONOutput } from './statusline.js';
import { runSetup } from './setup.js';
import { getStyle, styleNames, DEFAULT_STYLE } from './styles.js';
import type { StatuslineInput, HiddenField } from './types.js';

const VALID_HIDE_FIELDS = new Set<HiddenField>(['cost', 'diff', 'duration', 'model', 'cwd', 'branch']);

const STDIN_TIMEOUT = 3000;
const MAX_STDIN = 64 * 1024;

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

  return result;
}

function parseHide(raw: string): Set<HiddenField> {
  const result = new Set<HiddenField>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim() as HiddenField;
    if (VALID_HIDE_FIELDS.has(trimmed)) result.add(trimmed);
  }
  return result;
}

function parseFlags(args: string[]): { json: boolean; styleName: string; hide: Set<HiddenField> } {
  let json = false;
  let styleName = DEFAULT_STYLE;
  let hide = new Set<HiddenField>();
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
    }
  }
  return { json, styleName, hide };
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
      '  --style <name>  Bar style (classic, dot, braille, block, ascii, square, pipe)\n' +
      '  --hide <fields> Hide fields: cost,diff,duration,model,cwd,branch\n' +
      '  --json          Output JSON\n' +
      '  --help          Show this help\n' +
      '  --version       Show version\n'
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

  const { json, styleName, hide } = parseFlags(args);

  if (!json) {
    const style = getStyle(styleName);
    if (!style) {
      process.stderr.write(`Unknown style: ${styleName}\nAvailable: ${styleNames().join(', ')}\n`);
      process.exit(1);
    }
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

  const input = validateInput(parsed);

  if (json) {
    process.stdout.write(JSON.stringify(buildJSONOutput(input, hide)) + '\n');
  } else {
    process.stdout.write(renderStatusline(input, getStyle(styleName)!, hide) + '\n');
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.message ?? e) + '\n');
  process.exit(1);
});
