import { z } from 'zod';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: только a-z, 0-9 и одиночные дефисы');
const date = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'ожидается формат YYYY-MM-DD');
const nonEmpty = z.string().trim().min(1, 'не может быть пустым');
const url = z.string().url('некорректный URL');

const linkSchema = z.object({
  label: nonEmpty,
  url,
});

const skillSchema = z.object({
  name: nonEmpty,
  category: nonEmpty,
});

const experienceSchema = z
  .object({
    company: nonEmpty,
    position: nonEmpty,
    startDate: date,
    endDate: date.optional(),
    achievements: z.array(nonEmpty).default([]),
  })
  .refine((e) => e.endDate === undefined || e.endDate >= e.startDate, {
    message: 'endDate не может быть раньше startDate',
    path: ['endDate'],
  });

const projectSchema = z.object({
  name: nonEmpty,
  description: z.string().optional(),
  url,
  repositoryUrl: url.optional(),
  technologies: z.array(nonEmpty).default([]),
});

const profileSchema = z
  .object({
    slug,
    isPrimary: z.boolean().default(false),
    name: nonEmpty,
    title: nonEmpty,
    description: nonEmpty,
    location: z.string().optional(),
    email: z.string().email('некорректный email').optional(),
    links: z.array(linkSchema).default([]),
    skills: z.array(skillSchema).default([]),
    experience: z.array(experienceSchema).default([]),
    projects: z.array(projectSchema).default([]),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.skills.forEach((s, i) => {
      const key = s.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['skills', i, 'name'],
          message: `дубликат навыка "${s.name}"`,
        });
      }
      seen.add(key);
    });
  });

export const profilesSchema = z
  .array(profileSchema)
  .min(1, 'нужен хотя бы один профиль (пустой список удалил бы все данные)')
  .superRefine((list, ctx) => {
    const slugs = new Set<string>();
    list.forEach((p, i) => {
      if (slugs.has(p.slug)) {
        ctx.addIssue({ code: 'custom', path: [i, 'slug'], message: `дубликат slug "${p.slug}"` });
      }
      slugs.add(p.slug);
    });
    const primaryCount = list.filter((p) => p.isPrimary).length;
    if (primaryCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: `должен быть ровно один профиль с isPrimary: true (сейчас: ${primaryCount})`,
      });
    }
  });

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

export function parseProfilesData(raw: unknown): ProfileData[] {
  const result = profilesSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - [${i.path.join('.') || 'root'}] ${i.message}`)
      .join('\n');
    throw new Error(`Файл данных профилей невалиден:\n${details}`);
  }
  return result.data;
}
