# claude-usage-line

[![npm](https://img.shields.io/npm/v/claude-usage-line)](https://npmjs.com/package/claude-usage-line)
[![license](https://img.shields.io/npm/l/claude-usage-line)](LICENSE)
[![node](https://img.shields.io/node/v/claude-usage-line)](package.json)

<img width="663" height="141" alt="Screenshot 2026-03-29 at 20 19 21" src="https://github.com/user-attachments/assets/d78c061c-c263-4252-aed9-f1c4252cf94d" />

Cross-platform Claude Code statusline — session context, 5-hour & 7-day rate limits, git branch, diff stats, cost, and duration. Zero runtime dependencies, no `jq` required, no credentials required.

**Full output** (when Claude Code sends extended data):

```
~/dev/project  main
Opus 4.7 │ Cx █████░░░ 62% │ 5h ████░░░░ 48% ⟳3h28m │ 7d █████░░░ 63% ⟳22h30m │ +123 -45 │ $0.50 │ 12m
```

**Minimal output** (backward compatible — only `context_window` provided):

```
Cx █████░░░ 62% │ 5h ░░░░░░░░ 0% ⟳-- │ 7d ░░░░░░░░ 0% ⟳--
```

## Prerequisites

- Node.js ≥ 18
- Claude Code ≥ 2.1 (statusline JSON must include `rate_limits` for 5h/7d bars to show real data)

No OAuth, no API keys, no credential storage. Rate-limit data is provided directly by Claude Code on stdin.

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
    │    rate_limits.five_hour.*            │
    │    rate_limits.seven_day.*            │
    ├──────────────────────────────────────▶│
    │                                       ├─▶ Detect git branch (cwd)
    │                                       ├─▶ Render bars + metadata
    │                                       │
    │  stdout: ANSI statusline              │
    │◀──────────────────────────────────────┤
```

Stateless, synchronous, no background processes, no disk cache.

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

`rate_limits` is populated by Claude Code for Claude.ai Pro/Max subscribers after the first API response of a session. When absent, 5h/7d bars render as `0%` with `⟳--`.

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
  --style <name>  Bar style (classic, dot, braille, block, ascii, square, pipe)
  --hide <fields> Hide fields (comma-separated): cost,diff,duration,model,cwd,branch
  --sep <name>    Separator style: bullet (default), pipe
  --json          Output JSON
  --help          Show help
  --version       Show version
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

Available fields: `cost`, `diff`, `duration`, `model`, `cwd`, `branch`

## Development

```bash
npm run build
echo '{"context_window":{"used_percentage":62}}' | node dist/cli.js
echo '{"cwd":"/tmp","model":{"display_name":"Opus 4.7"},"context_window":{"used_percentage":85},"cost":{"total_lines_added":42,"total_lines_removed":10,"total_cost_usd":1.23,"total_duration_ms":3720000},"rate_limits":{"five_hour":{"used_percentage":48,"resets_at":1776945496},"seven_day":{"used_percentage":63,"resets_at":1777014016}}}' | node dist/cli.js
```

## License

MIT
