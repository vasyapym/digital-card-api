// src/second-brain/auth/hash-passphrase.ts
import { Algorithm, hashSync } from '@node-rs/argon2';

// CLI: node dist/second-brain/auth/hash-passphrase.js
// Reads the passphrase from stdin without echo and prints only the PHC hash.
// Exit codes: 0 ok, 2 empty passphrase, 130 interrupted with Ctrl-C.
const HASH_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

// Removes exactly one trailing "\n" or "\r\n"; interior whitespace is part of the passphrase.
export function stripTrailingNl(s: string): string {
  if (s.endsWith('\r\n')) {
    return s.slice(0, -2);
  }
  if (s.endsWith('\n')) {
    return s.slice(0, -1);
  }
  return s;
}

function setRawMode(stdin: NodeJS.ReadStream, enabled: boolean): void {
  // Only a real TTY has setRawMode; piped stdin is a plain socket or file.
  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(enabled);
  }
}

// Piped input: read everything up to EOF as UTF-8.
async function readAll(stdin: NodeJS.ReadStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(
      typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk),
    );
  }
  return Buffer.concat(chunks).toString('utf8');
}

// TTY input: raw mode turns echo off but also disables line buffering and EOF,
// so Enter or Ctrl-D ends the passphrase here. Backspace removes one code point.
function readLineRaw(stdin: NodeJS.ReadStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const bytes: number[] = [];
    const finish = (): void => {
      cleanup();
      resolve(Buffer.from(bytes).toString('utf8'));
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 0x03) {
          cleanup();
          reject(new Error('interrupted'));
          return;
        }
        if (byte === 0x0d || byte === 0x0a || byte === 0x04) {
          finish();
          return;
        }
        if (byte === 0x7f || byte === 0x08) {
          let popped = bytes.pop();
          while (popped !== undefined && (popped & 0xc0) === 0x80) {
            popped = bytes.pop();
          }
          continue;
        }
        bytes.push(byte);
      }
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.off('end', finish);
      stdin.off('error', onError);
    };
    stdin.on('data', onData);
    stdin.on('end', finish);
    stdin.on('error', onError);
  });
}

async function readPassphrase(): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return readAll(stdin);
  }
  // One cue on stderr so the silent raw read never looks hung; stdout stays clean
  // (the hash line only), which keeps pipe users unaffected.
  process.stderr.write('passphrase: ');
  setRawMode(stdin, true);
  try {
    return await readLineRaw(stdin);
  } catch (err) {
    process.exitCode = 130;
    throw err;
  } finally {
    setRawMode(stdin, false);
    stdin.pause();
  }
}

async function main(): Promise<void> {
  let input: string;
  try {
    input = await readPassphrase();
  } catch {
    process.exitCode = 130;
    return;
  }
  if (process.stdin.isTTY) {
    process.stderr.write('\n');
  }
  const passphrase = stripTrailingNl(input);
  if (passphrase.length === 0) {
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${hashSync(passphrase, HASH_OPTIONS)}\n`);
}

// Run only as a CLI entry point; importing this module (e.g. from specs) has no side effects.
if (require.main === module) {
  void main();
}
