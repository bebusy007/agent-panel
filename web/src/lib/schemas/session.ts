import { z } from 'zod';

export const sessionSummarySchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  firstUserMessage: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  cwdShort: z.string().nullable().optional(),
  messageCount: z.number(),
  tokensTotal: z.number().nullable().optional(),
  model: z.string().nullable().optional(),
  lastActivity: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
  isRunning: z.boolean().optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'tool_use', 'tool_result', 'meta', 'system']),
  text: z.string().nullable().optional(),
  toolName: z.string().nullable().optional(),
  toolInput: z.any().nullable().optional(),
  toolOutput: z.any().nullable().optional(),
  toolUseId: z.string().nullable().optional(),
  toolStatus: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  images: z.array(z.any()).optional(),
});

export const sessionDetailSchema = z.object({
  summary: sessionSummarySchema,
  messages: z.array(messageSchema),
  subagents: z.array(z.any()).optional(),
  resumeHints: z.any().nullable().optional(),
});
