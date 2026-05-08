import { join } from 'path';
import { homedir, platform } from 'os';

export type Platform = 'darwin' | 'linux' | 'win32';

export function getPlatform(): Platform {
  const p = platform();
  if (p === 'darwin' || p === 'linux' || p === 'win32') return p;
  return 'linux';
}

export function getCachePath(): string {
  const p = getPlatform();
  const home = homedir();
  if (p === 'win32') {
    const appData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    return join(appData, 'claude-usage-line', 'cache.json');
  }
  if (p === 'darwin') {
    return join(home, 'Library', 'Caches', 'claude-usage-line', 'cache.json');
  }
  const xdgCache = process.env.XDG_CACHE_HOME || join(home, '.cache');
  return join(xdgCache, 'claude-usage-line', 'cache.json');
}

export function getCredentialsPath(): string {
  return join(homedir(), '.claude', '.credentials.json');
}

export function getSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}
