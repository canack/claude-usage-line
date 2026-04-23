import type { BarStyle } from './types.js';

const STYLES: ReadonlyMap<string, BarStyle> = new Map([
  ['classic', { filled: '█', empty: '░', width: 8, separator: '•', resetIcon: '⟳' }],
  ['dot',     { filled: '●', empty: '○', width: 8, separator: '•', resetIcon: '⟳' }],
  ['braille', { filled: '⣿', empty: '⣀', width: 8, separator: '•', resetIcon: '⟳' }],
  ['block',   { filled: '▰', empty: '▱', width: 10, separator: '•', resetIcon: '⟳' }],
  ['ascii',   { filled: '#', empty: '-', width: 10, separator: '|', resetIcon: '~' }],
  ['square',  { filled: '▪', empty: '·', width: 10, separator: '•', resetIcon: '⟳' }],
  ['pipe',    { filled: '┃', empty: '╌', width: 8, separator: '┃', resetIcon: '↻' }],
]);

export const DEFAULT_STYLE = 'classic';

export function getStyle(name: string): BarStyle | undefined {
  return STYLES.get(name);
}

export function styleNames(): string[] {
  return [...STYLES.keys()];
}
