import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const queryRaw = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    })
      .useMocker((token) => {
        if (token === PrismaService) return { $queryRaw: queryRaw };
        return jest.fn();
      })
      .compile();
    controller = moduleRef.get(HealthController);
  });

  it('GET /health отвечает ok, не обращаясь к базе', () => {
    queryRaw.mockClear();
    expect(controller.check()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/db подтверждает, что база отвечает', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(controller.checkDb()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('GET /health/db отвечает 503, если база недоступна', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.checkDb()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
