import { spawn } from 'node:child_process';
import { Terminal } from '@xterm/headless';
import { parseUsageScreen } from './parser.js';

// Python supplies a real controlling PTY without a native Node addon. It owns
// the entire agy process group and reaps it on EOF, cancellation, or timeout.
const PTY = String.raw`
import os, pty, sys, select, signal, struct, fcntl, termios, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp('agy', ['agy', '--log-file', os.devnull])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 100, 160, 0, 0))
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
try:
    while True:
        ready, _, _ = select.select([fd, 0], [], [], 1)
        if fd in ready:
            try: data = os.read(fd, 65536)
            except OSError: break
            if not data: break
            os.write(1, data)
        if 0 in ready:
            data = os.read(0, 65536)
            if not data: break
            os.write(fd, data)
finally:
    os.close(fd)
    try: os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError: pass
    for _ in range(20):
        if os.waitpid(pid, os.WNOHANG)[0]: break
        time.sleep(0.05)
    else:
        try: os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError: pass
        os.waitpid(pid, 0)
`;

export async function collectUsage(cwd: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const terminal = new Terminal({cols:160, rows:100, scrollback:0, allowProposedApi:true});
  const child = spawn('python3', ['-u', '-c', PTY], {cwd, env:{...process.env, TERM:'xterm-256color'}, stdio:['pipe','pipe','pipe']});
  let trustConfirmed = false, usageSent = false, bytes = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const terminalResponse = terminal.onData(data => child.stdin.write(data));
  const screen = () => Array.from({length:terminal.rows}, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n');
  try {
    return await new Promise<ReturnType<typeof parseUsageScreen>>((resolve, reject) => {
      const abort = () => finish(new Error('Usage collection cancelled.'));
      signal.addEventListener('abort', abort, {once:true});
      const timeout = setTimeout(() => finish(new Error('Timed out reading agy /usage. Run agy once to complete sign-in or setup.')), 25_000);
      const finish = (error?: Error) => { clearTimeout(timeout); signal.removeEventListener('abort', abort); if(error) reject(error); };
      child.once('error', () => finish(new Error('Could not start python3. Install Python 3 and agy on this host.')));
      child.once('close', () => finish(new Error('agy exited before its usage panel could be read. Verify agy and python3 are installed and signed in.')));
      child.stdin.on('error', () => finish(new Error('agy terminal input closed before collection completed.')));
      child.stderr.resume(); // Never retain or report raw CLI diagnostics.
      child.stdout.on('data', (data: Buffer) => {
        bytes += data.length;
        if (bytes > 2_000_000) { finish(new Error('agy terminal output exceeded the collection limit.')); return; }
        terminal.write(data, () => {
          const text = screen();
          // This cwd is an empty plugin-owned workspace, never a user's project.
          if (!trustConfirmed && text.includes('Do you trust the contents of this project?') && text.includes('Yes, I trust this folder')) {
            trustConfirmed = true; child.stdin.write('\r');
          }
          if (!usageSent && text.includes('? for shortcuts')) { usageSent = true; child.stdin.write('/usage\r'); }
          if (usageSent) {
            clearTimeout(settle);
            try {
              const value = parseUsageScreen(text);
              settle = setTimeout(() => { finish(); resolve(value); }, 750);
            } catch { /* Wait for the complete screen rather than parsing a redraw. */ }
          }
        });
      });
    });
  } finally {
    clearTimeout(settle);
    terminalResponse.dispose();
    child.stdin.end();
    // Closing the pipe asks Python to terminate/reap agy. Reap before returning.
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        const kill = setTimeout(() => child.kill('SIGTERM'), 1500);
        child.once('close', () => {clearTimeout(kill); resolve();});
      });
    }
    terminal.dispose();
  }
}
