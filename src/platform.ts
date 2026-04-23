import { join } from 'path';
import { homedir } from 'os';

export function getSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}
