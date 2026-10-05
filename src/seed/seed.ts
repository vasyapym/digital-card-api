import { PrismaClient } from '@prisma/client';
import { validateEnv } from '../config/env';
import { parseProfilesData } from '../data/profile-data.schema';
import { profilesData } from '../data/profiles.data';
import { parseDate } from '../profile/domain/experience-period';

const SEED_LOCK_KEY = 724_501_001;

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const profiles = parseProfilesData(profilesData);

  const prisma = new PrismaClient({ datasourceUrl: env.DIRECT_URL });
  const startedAt = Date.now();

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`);

        const slugs = profiles.map((p) => p.slug);
        const removed = await tx.profile.deleteMany({ where: { slug: { notIn: slugs } } });

        for (const p of profiles) {
          const scalars = {
            isPrimary: p.isPrimary,
            name: p.name,
            title: p.title,
            description: p.description,
            location: p.location ?? null,
            email: p.email ?? null,
          };

          const { id: profileId } = await tx.profile.upsert({
            where: { slug: p.slug },
            create: { slug: p.slug, ...scalars },
            update: scalars,
            select: { id: true },
          });

          await tx.link.deleteMany({ where: { profileId } });
          await tx.skill.deleteMany({ where: { profileId } });
          await tx.experience.deleteMany({ where: { profileId } });
          await tx.project.deleteMany({ where: { profileId } });

          await tx.link.createMany({
            data: p.links.map((l, i) => ({ profileId, sortOrder: i, label: l.label, url: l.url })),
          });

          await tx.skill.createMany({
            data: p.skills.map((s, i) => ({ profileId, sortOrder: i, name: s.name, category: s.category })),
          });

          await tx.experience.createMany({
            data: p.experience.map((e, i) => ({
              profileId,
              sortOrder: i,
              company: e.company,
              position: e.position,
              achievements: e.achievements,
              description: e.description ?? null,
              startDate: parseDate(e.startDate),
              endDate: e.endDate ? parseDate(e.endDate) : null,
            })),
          });

          await tx.project.createMany({
            data: p.projects.map((pr, i) => ({
              profileId,
              sortOrder: i,
              name: pr.name,
              description: pr.description ?? null,
              url: pr.url,
              repositoryUrl: pr.repositoryUrl ?? null,
              technologies: pr.technologies,
            })),
          });
        }

        return { synced: profiles.length, removed: removed.count };
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    console.log(
      `[seed] OK: профилей синхронизировано: ${summary.synced}, удалено устаревших: ${summary.removed}, ` +
        `за ${Date.now() - startedAt} мс`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] ОШИБКА, транзакция откатена:', err instanceof Error ? err.message : err);
  process.exit(1);
});
