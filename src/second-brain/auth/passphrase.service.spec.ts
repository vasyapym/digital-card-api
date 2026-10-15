// src/second-brain/auth/passphrase.service.spec.ts
import { Algorithm, hashSync } from '@node-rs/argon2';
import { PassphraseService } from './passphrase.service';

// Low-cost parameters keep the suite fast; the PHC string is self-describing.
const CHEAP = { algorithm: Algorithm.Argon2id, memoryCost: 512, timeCost: 1 };
const PASSPHRASE = 'correct horse battery staple';

describe('PassphraseService', () => {
  const service = new PassphraseService(hashSync(PASSPHRASE, CHEAP));

  it('accepts the right passphrase', async () => {
    await expect(service.verify(PASSPHRASE)).resolves.toBe(true);
  });

  it('rejects a wrong passphrase', async () => {
    await expect(service.verify('wrong passphrase')).resolves.toBe(false);
  });

  it('treats whitespace and case as significant', async () => {
    await expect(service.verify(` ${PASSPHRASE}`)).resolves.toBe(false);
    await expect(service.verify(`${PASSPHRASE}\n`)).resolves.toBe(false);
    await expect(service.verify(PASSPHRASE.toUpperCase())).resolves.toBe(false);
  });

  it('rejects an empty candidate', async () => {
    await expect(service.verify('')).resolves.toBe(false);
  });

  it('resolves false instead of rejecting for a malformed PHC string', async () => {
    const broken = new PassphraseService('not-a-phc');
    await expect(broken.verify('anything')).resolves.toBe(false);
  });

  it('resolves false for an empty hash', async () => {
    await expect(new PassphraseService('').verify(PASSPHRASE)).resolves.toBe(
      false,
    );
  });

  it('resolves false for a truncated argon2id hash', async () => {
    const truncated = hashSync(PASSPHRASE, CHEAP).slice(0, 30);
    await expect(
      new PassphraseService(truncated).verify(PASSPHRASE),
    ).resolves.toBe(false);
  });
});
