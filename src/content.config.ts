import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const visibility = z.enum(["public", "private"]);

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
});

const sharedFields = {
  title: z.string().min(1),
  summary: z.string().min(1),
  publishedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  cover: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  visibility: visibility.default("public"),
  draft: z.boolean().default(true),
  related: z.array(z.string().min(1)).default([]),
};

const journey = defineCollection({
  loader: glob({
    base: "./src/content/journey",
    pattern: "**/[^_]*.{md,mdx}",
  }),
  schema: z.object({
    ...sharedFields,
    type: z.enum(["education", "internship", "milestone"]),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    place: z.string().min(1),
    role: z.string().min(1),
    coordinates: z
      .tuple([
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
      ])
      .optional(),
  }),
});

const research = defineCollection({
  loader: glob({
    base: "./src/content/research",
    pattern: "**/[^_]*.{md,mdx}",
  }),
  schema: z.object({
    ...sharedFields,
    kind: z.enum(["paper", "report", "patent", "dataset", "code", "competition"]),
    status: z.enum(["published", "submitted", "in-progress", "completed"]),
    authors: z.array(z.string().min(1)).min(1),
    contribution: z.string().min(1),
    links: z.array(linkSchema).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({
    base: "./src/content/projects",
    pattern: "**/[^_]*.{md,mdx}",
  }),
  schema: z.object({
    ...sharedFields,
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().optional(),
    challenge: z.string().min(1),
    role: z.string().min(1),
    outcome: z.string().min(1),
    links: z.array(linkSchema).default([]),
  }),
});

const notes = defineCollection({
  loader: glob({
    base: "./src/content/notes",
    pattern: "**/[^_]*.{md,mdx}",
  }),
  schema: z.object({
    ...sharedFields,
    topic: z.string().min(1),
    series: z.string().min(1).optional(),
    order: z.number().int().nonnegative().optional(),
  }),
});

const treasure = defineCollection({
  loader: glob({
    base: "./src/content/treasure",
    pattern: "**/[^_]*.{md,mdx}",
  }),
  schema: z.object({
    ...sharedFields,
    visibility: visibility.default("private"),
    kind: z.enum(["moment", "place", "object", "story", "letter"]),
    occurredAt: z.coerce.date(),
    place: z.string().min(1).optional(),
    consentConfirmed: z.boolean().default(false),
  }),
});

export const collections = { journey, research, projects, notes, treasure };
