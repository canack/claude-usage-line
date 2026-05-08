import { spawn } from 'child_process';
import { join } from 'path';
import { getToken } from './credentials.js';
import { acquireFetchLock, releaseFetchLock } from './cache.js';

export function spawnBackgroundFetch(): void {
  if (!acquireFetchLock()) return;

  const token = getToken();
  if (!token) { releaseFetchLock(); return; }

  try {
    const workerPath = join(__dirname, 'fetch-worker.js');

    const child = spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        HOMEDRIVE: process.env.HOMEDRIVE,
        HOMEPATH: process.env.HOMEPATH,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      },
    });

    child.on('error', () => releaseFetchLock());

    if (!child.stdin) { releaseFetchLock(); return; }

    const buf = Buffer.from(token, 'utf-8');
    child.stdin.write(buf);
    child.stdin.end();
    buf.fill(0);
    child.unref();
  } catch {
    releaseFetchLock();
  }
}
