export const RST = '\x1b[0m';
export const DIM = '\x1b[2m';
export const RED = '\x1b[31m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const MAGENTA = '\x1b[35m';
export const BLUE = '\x1b[34m';
export const CYAN = '\x1b[36m';

export const ORG_COLORS: Record<string, string> = {
  purple: '\x1b[38;5;98m',
  teal: '\x1b[38;5;37m',
  steel: '\x1b[38;5;67m',
  gold: '\x1b[38;5;178m',
  coral: '\x1b[38;5;168m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  yellow: YELLOW,
  green: GREEN,
};

export const DEFAULT_ORG_COLOR_NAME = 'purple';

export function orgColorNames(): string[] {
  return Object.keys(ORG_COLORS);
}

export function resolveOrgColor(name: string): string | null {
  return ORG_COLORS[name] ?? null;
}

export function colorByThreshold(pct: number, base: string): string {
  if (pct >= 80) return RED;
  if (pct >= 50) return YELLOW;
  return base;
}

export function dim(s: string): string {
  return DIM + s + RST;
}
