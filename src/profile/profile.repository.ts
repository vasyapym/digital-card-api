import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const profileInclude = {
  links: { orderBy: { sortOrder: 'asc' } },
  skills: { orderBy: { sortOrder: 'asc' } },
  experiences: { orderBy: { sortOrder: 'asc' } },
  projects: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProfileInclude;

export type ProfileRecord = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<ProfileRecord | null> {
    return this.prisma.profile.findUnique({ where: { slug }, include: profileInclude });
  }

  findPrimary(): Promise<ProfileRecord | null> {
    return this.prisma.profile.findFirst({
      where: { isPrimary: true },
      orderBy: { slug: 'asc' },
      include: profileInclude,
    });
  }
}
