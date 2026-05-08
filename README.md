# claude-usage-line

[![npm](https://img.shields.io/npm/v/claude-usage-line)](https://npmjs.com/package/claude-usage-line)
[![license](https://img.shields.io/npm/l/claude-usage-line)](LICENSE)
[![node](https://img.shields.io/node/v/claude-usage-line)](package.json)

<img width="663" height="141" alt="Screenshot 2026-03-29 at 20 19 21" src="https://github.com/user-attachments/assets/d78c061c-c263-4252-aed9-f1c4252cf94d" />

Cross-platform Claude Code statusline — session context, 5-hour & 7-day rate limits (Pro/Max) or **organization monthly cap (Enterprise)**, git branch, diff stats, cost, and duration. Zero runtime dependencies, no `jq` required.

**Pro/Max output** (Claude Code sends `rate_limits` on stdin):

```
~/dev/project  main
Opus 4.7 │ Cx █████░░░ 62% │ 5h ████░░░░ 48% ⟳3h28m │ 7d █████░░░ 63% ⟳22h30m │ +123 -45 │ $0.50 │ 12m
```

**Enterprise output** (no `rate_limits` on stdin → OAuth fallback fetches `extra_usage`):

```
~/dev/project  main
Opus 4.7 │ Cx █████░░░ 62% │ Org █░░░░░░░░░░░░░░░ 7% $16/$200 ⟳23d15h
```

**Minimal output** (only `context_window` provided, no fallback data yet):

```
Cx █████░░░ 62% │ 5h ░░░░░░░░ 0% ⟳-- │ 7d ░░░░░░░░ 0% ⟳--
```

## Prerequisites

- Node.js ≥ 18
- Claude Code ≥ 2.1

For **Pro/Max** subscribers, `rate_limits` is provided directly by Claude Code on stdin — no OAuth, no API keys, no network calls.

For **Enterprise** users, stdin doesn't include `rate_limits`, so the statusline falls back to a background OAuth call against the same endpoint Claude Code's own `/usage` view reads (`api.anthropic.com/api/oauth/usage`). The OAuth token is read from your existing Claude Code login (macOS keychain / `secret-tool` / Windows Credential Manager / `~/.claude/.credentials.json`). No API key needed; nothing new to configure. To opt out, set `CLAUDE_USAGE_LINE_NO_FETCH=1`.

## Quick Start

```bash
npx claude-usage-line setup
```

Or manually add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx claude-usage-line"
  }
}
```

Custom bar style:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx claude-usage-line --style dot"
  }
}
```

Restart Claude Code and the statusline appears.

## How It Works

```
Claude Code                         claude-usage-line
    │                                       │
    │  stdin JSON:                          │
    │    context_window.used_percentage     │
    │    cwd                                │
    │    model.display_name                 │
    │    cost.*                             │
    │    rate_limits.five_hour.*  (Pro/Max) │
    │    rate_limits.seven_day.*  (Pro/Max) │
    ├──────────────────────────────────────▶│
    │                                       ├─▶ Detect git branch (cwd)
    │                                       │
    │       stdin lacks rate_limits?        │
    │       (Enterprise plan path)          │
    │       ┌───────────────────────────┐   │
    │       │ Read disk cache           │   │
    │       │ Spawn background fetch    │   │
    │       │   GET /api/oauth/usage    │   │
    │       │   → extra_usage bucket    │   │
    │       │   → write cache (5min TTL)│   │
    │       └───────────────────────────┘   │
    │                                       ├─▶ Render bars + metadata
    │                                       │
    │  stdout: ANSI statusline              │
    │◀──────────────────────────────────────┤
```

The OAuth fallback path activates only when stdin doesn't carry `rate_limits` — i.e. Pro/Max users on Claude Code 2.1+ never hit the API, while Enterprise users get the org-cap bar through a cached background fetch (60s TTL minimum, 5min default to avoid 429s).

### Supported stdin fields

| Field | Required | Description |
|-------|----------|-------------|
| `context_window.used_percentage` | Yes | Session context usage % |
| `cwd` | No | Working directory → enables git branch detection |
| `model.display_name` | No | Model name shown on line 2 |
| `cost.total_lines_added` | No | Lines added (green) |
| `cost.total_lines_removed` | No | Lines removed (red) |
| `cost.total_cost_usd` | No | Session cost in USD |
| `cost.total_duration_ms` | No | Session duration |
| `rate_limits.five_hour.used_percentage` | No | 5h rolling window usage |
| `rate_limits.five_hour.resets_at` | No | Unix epoch seconds |
| `rate_limits.seven_day.used_percentage` | No | 7d window usage |
| `rate_limits.seven_day.resets_at` | No | Unix epoch seconds |

When `cwd` or `model` is present → 2-line output. Otherwise → single-line (backward compatible).

`rate_limits` is populated by Claude Code for Claude.ai Pro/Max subscribers after the first API response of a session. When absent, the OAuth fallback path (Enterprise) takes over and renders the **Org** bar instead of `5h`/`7d`. If neither is available, the bars row collapses to just `Cx` until data arrives.

### Enterprise: `extra_usage` (Org bar)

The OAuth fallback writes an `extra_usage` block into the cache, sourced from `api.anthropic.com/api/oauth/usage`:

| Field | Description |
|-------|-------------|
| `used_percentage` | 0–100, computed by Anthropic |
| `used_credits_cents` | This month's spend, in cents |
| `monthly_limit_cents` | Org-set per-user monthly cap, in cents |
| `currency` | `USD`, `EUR`, etc. |
| `resets_at` | First of next month, UTC, Unix epoch seconds |

When `extra_usage` is present, the bar replaces 5h/7d:

```
Org ████████████████░░░░ 7% $16/$200 ⟳23d15h
```

Bar width is `clamp(16, 2 × style.width, 40)` (so `--style=block` gives a 20-wide bar). If `monthly_limit_cents === 0`, the org has no per-user cap — the bar renders empty with `$X / ∞`.

**Threshold colors override `--org-color`** at high utilization: `≥50%` shifts to yellow, `≥80%` to red. So `--org-color gold` and `--org-color yellow` lose their distinct base color exactly at the points where the warning matters most — pick a base that contrasts with yellow (purple, teal, steel, blue, magenta, cyan, coral, green) for clearest signal.

## Bar Styles

| Style | Preview | Width |
|-------|---------|-------|
| `classic` (default) | `█████░░░` | 8 |
| `dot` | `●●●●●○○○` | 8 |
| `braille` | `⣿⣿⣿⣿⣿⣀⣀⣀` | 8 |
| `block` | `▰▰▰▰▰▰▱▱▱▱` | 10 |
| `ascii` | `#####-----` | 10 |
| `square` | `▪▪▪▪▪·····` | 10 |
| `pipe` | `┃┃┃┃┃╌╌╌` | 8 |

### Colors

Each bar changes color at thresholds:

- **< 50%**: base color (Session=magenta, 5h=cyan, 7d=green)
- **≥ 50%**: yellow
- **≥ 80%**: red

Additional: model name=magenta, cwd=blue, branch=green, additions=green, removals=red, cost=yellow

## JSON Output

```bash
echo '{"context_window":{"used_percentage":62}}' | npx claude-usage-line --json
```

```json
{
  "model": null,
  "cwd": null,
  "git_branch": null,
  "session": { "utilization_pct": 62, "resets_at": null, "remaining": "--" },
  "five_hour": { "utilization_pct": 48, "resets_at": 1776945496, "remaining": "3h28m" },
  "seven_day": { "utilization_pct": 63, "resets_at": 1777014016, "remaining": "22h30m" },
  "org": {
    "utilization_pct": 7,
    "used_usd": 15.83,
    "limit_usd": 200,
    "currency": "USD",
    "resets_at": 1780272000,
    "remaining": "23d15h"
  },
  "diff": { "added": 0, "removed": 0 },
  "cost_usd": null,
  "duration_min": null
}
```

`resets_at` is Unix epoch seconds (matches Claude Code stdin schema).

## CLI Reference

```
Usage: claude-usage-line [options]
       claude-usage-line setup

Options:
  --style <name>      Bar style (classic, dot, braille, block, ascii, square, pipe)
  --hide <fields>     Hide fields (comma-separated): cost,diff,duration,model,cwd,branch,org
  --sep <name>        Separator style: bullet (default), pipe
  --org-color <name>  Org bar color: purple (default), teal, steel, gold, coral,
                      blue, magenta, cyan, yellow, green
  --json              Output JSON
  --help              Show help
  --version           Show version

Environment:
  CLAUDE_USAGE_LINE_NO_FETCH=1   Disable OAuth fallback (skips Enterprise Org bar)
  CLAUDE_CODE_OAUTH_TOKEN=<tok>  One-shot token override (consumed and unset)
```

### Hiding Fields

Use `--hide` to selectively hide parts of the output:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx claude-usage-line --hide cost,duration"
  }
}
```

Available fields: `cost`, `diff`, `duration`, `model`, `cwd`, `branch`, `org`

## Development

```bash
npm run build
echo '{"context_window":{"used_percentage":62}}' | node dist/cli.js
echo '{"cwd":"/tmp","model":{"display_name":"Opus 4.7"},"context_window":{"used_percentage":85},"cost":{"total_lines_added":42,"total_lines_removed":10,"total_cost_usd":1.23,"total_duration_ms":3720000},"rate_limits":{"five_hour":{"used_percentage":48,"resets_at":1776945496},"seven_day":{"used_percentage":63,"resets_at":1777014016}}}' | node dist/cli.js
```

## License

MIT
