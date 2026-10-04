import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';

describe('DI-граф', () => {
  it('AppController получает свои зависимости из ProfileModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ProfileModule],
      controllers: [AppController],
    }).compile();
    expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
  });
});
