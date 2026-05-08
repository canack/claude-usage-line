import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { getPlatform, getCredentialsPath } from './platform.js';

function extractAccessToken(json: string): string | null {
  try {
    const parsed = JSON.parse(json);
    const token = parsed?.claudeAiOauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function fromEnv(): string | null {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (typeof token === 'string' && token.length > 0) {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    return token;
  }
  return null;
}

function fromMacKeychain(): string | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return extractAccessToken(raw);
  } catch {
    return null;
  }
}

function fromSecretTool(): string | null {
  try {
    const raw = execFileSync(
      'secret-tool',
      ['lookup', 'service', 'Claude Code-credentials'],
      { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return extractAccessToken(raw);
  } catch {
    return null;
  }
}

function fromWindowsCredentialManager(): string | null {
  try {
    const ps = [
      '$ErrorActionPreference="Stop"',
      '[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]',
      '$vault=New-Object Windows.Security.Credentials.PasswordVault',
      '$c=$vault.Retrieve("Claude Code-credentials","claude")',
      '$c.RetrievePassword()',
      'Write-Output $c.Password',
    ].join(';');
    const raw = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).toString().trim();
    return extractAccessToken(raw);
  } catch {
    return null;
  }
}

function hasDBusSession(): boolean {
  return !!(process.env.DBUS_SESSION_BUS_ADDRESS || process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function fromCredentialsFile(): string | null {
  try {
    const raw = readFileSync(getCredentialsPath(), 'utf-8');
    return extractAccessToken(raw);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  const env = fromEnv();
  if (env) return env;

  const p = getPlatform();
  if (p === 'darwin') {
    const kc = fromMacKeychain();
    if (kc) return kc;
  }
  if (p === 'linux' && hasDBusSession()) {
    const st = fromSecretTool();
    if (st) return st;
  }
  if (p === 'win32') {
    const wc = fromWindowsCredentialManager();
    if (wc) return wc;
  }
  return fromCredentialsFile();
}
