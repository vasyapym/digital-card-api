import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { AppController } from './app.controller';
import { ProfileCardView } from './profile/profile-card.view';
import { ProfileService } from './profile/profile.service';
import { Profile } from './profile/models/profile.models';

const profile: Profile = {
  id: 1,
  slug: 'vasily-argunov',
  name: 'Vasily Argunov',
  title: 't',
  description: 'd',
  location: null,
  email: null,
  links: [],
  skills: [],
  experience: [],
  projects: [],
};

function fakeRes(): { header: Record<string, string>; res: Response } {
  const header: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { header[k] = v; } } as unknown as Response;
  return { header, res };
}

describe('AppController GET /', () => {
  let controller: AppController;
  const render = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    })
      .useMocker((token) => {
        render.mockReturnValue('card-html');
        if (token === ProfileService) return { getProfile: () => Promise.resolve(profile) };
        if (token === ProfileCardView) return { render };
        return jest.fn();
      })
      .compile();
    controller = moduleRef.get(AppController);
  });

  it('renders the card without status and caches it', async () => {
    const { res, header } = fakeRes();
    const html = await controller.card(undefined, undefined, res);
    expect(render).toHaveBeenCalledWith(profile);
    expect(render.mock.calls[0]).toHaveLength(1);
    expect(header['Cache-Control']).toBe('public, max-age=300');
    expect(html).toBe('card-html');
  });

  it('maps ?sent=1 to the sent status without caching', async () => {
    const { res, header } = fakeRes();
    await controller.card('1', undefined, res);
    expect(render).toHaveBeenLastCalledWith(profile, 'sent');
    expect(header['Cache-Control']).toBe('no-store');
  });

  it('maps ?error=1 to the error status without caching', async () => {
    const { res, header } = fakeRes();
    await controller.card(undefined, '1', res);
    expect(render).toHaveBeenLastCalledWith(profile, 'error');
    expect(header['Cache-Control']).toBe('no-store');
  });
});
