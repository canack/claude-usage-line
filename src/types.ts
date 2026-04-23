export type HiddenField = 'cost' | 'diff' | 'duration' | 'model' | 'cwd' | 'branch';

export interface RateLimitBucket {
  used_percentage: number;
  resets_at: number;
}

export interface StatuslineInput {
  context_window: {
    used_percentage: number;
  };
  cwd?: string;
  model?: {
    display_name?: string;
  };
  cost?: {
    total_lines_added?: number;
    total_lines_removed?: number;
    total_cost_usd?: number;
    total_duration_ms?: number;
  };
  rate_limits?: {
    five_hour?: RateLimitBucket;
    seven_day?: RateLimitBucket;
  };
}

export interface BarStyle {
  readonly filled: string;
  readonly empty: string;
  readonly width: number;
  readonly separator: string;
  readonly resetIcon: string;
}

export interface JSONOutput {
  model: string | null;
  cwd: string | null;
  git_branch: string | null;
  session: {
    utilization_pct: number;
    resets_at: null;
    remaining: string;
  };
  five_hour: {
    utilization_pct: number;
    resets_at: number | null;
    remaining: string;
  };
  seven_day: {
    utilization_pct: number;
    resets_at: number | null;
    remaining: string;
  };
  diff: {
    added: number;
    removed: number;
  };
  cost_usd: number | null;
  duration_min: number | null;
}
