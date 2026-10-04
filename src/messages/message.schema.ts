import { z } from 'zod';

export const messageSchema = z.object({
  email: z
    .union([z.literal(''), z.string().trim().toLowerCase().max(254).email()])
    .optional()
    .default(''),
  message: z.string().trim().min(1).max(5000),
  company: z.string().optional().default(''),
});

export type MessageInput = z.infer<typeof messageSchema>;

export function parseMessageBody(raw: unknown): MessageInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const result = messageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
