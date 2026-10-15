// src/second-brain/auth/passphrase.service.ts
import { verify } from '@node-rs/argon2';

// Checks a login attempt against the configured argon2id PHC hash.
export class PassphraseService {
  constructor(private readonly hash: string) {}

  // Fails closed: a wrong passphrase and a malformed hash both resolve to false.
  // The PHC string is self-describing, so argon2 needs no algorithm pre-check.
  async verify(candidate: string): Promise<boolean> {
    try {
      return await verify(this.hash, candidate);
    } catch {
      return false;
    }
  }
}
