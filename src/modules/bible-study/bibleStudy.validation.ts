import { z } from "zod";

export const createBibleStudySchema = z.object({
  lessonNumber: z.number().int().positive(),
  title: z.string().trim().min(2).max(255),
  studyHeading: z.string().trim().max(255).nullable().optional(),
  topic: z.string().trim().min(2).max(255),
  theme: z.string().trim().min(2).max(255),
  studyDate: z.string().date(),
  textRef: z.string().trim().min(2).max(255),
  scriptureReferences: z.array(z.object({
    raw: z.string(),
    bookId: z.string().uuid().nullable(),
    bookName: z.string().nullable(),
    chapter: z.number().int().positive(),
    verseStart: z.number().int().positive(),
    verseEnd: z.number().int().positive().nullable(),
    recognized: z.boolean(),
  })).default([]),
  textContent: z.string().trim().optional(),
  memoryVerseRef: z.string().trim().min(2).max(100),
  memoryVerseText: z.string().trim().min(2),
  aim: z.string().trim().min(2),
  aims: z.array(z.string()).default([]),
  introduction: z.string().trim().min(2),
  studyGuide: z.array(z.string()).default([]),
  discussionQuestions: z.array(z.string()).default([]),
  conclusion: z.string().trim().min(2),
  prayerPoints: z.array(z.string()).default([]),
  foodForThought: z.string().trim().nullable().optional(),
  outlineAssetId: z.string().uuid().nullable().optional(),
});

export const updateBibleStudySchema = createBibleStudySchema.partial();

export const bibleStudyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export type CreateBibleStudyInput = z.infer<typeof createBibleStudySchema>;
export type UpdateBibleStudyInput = z.infer<typeof updateBibleStudySchema>;

// ---- Bible Study Series ----

const seriesLessonSchema = z.object({
  lessonNumber: z.number().int().positive(),
  title: z.string().trim().min(2).max(255).optional(),
  topic: z.string().trim().min(2).max(255),
  theme: z.string().trim().min(2).max(255),
  textRef: z.string().trim().min(2).max(255),
  textContent: z.string().trim().optional(),
  memoryVerseRef: z.string().trim().min(2).max(100),
  memoryVerseText: z.string().trim().min(2),
  aim: z.string().trim().min(2),
  aims: z.array(z.string()).default([]),
  introduction: z.string().trim().min(2),
  studyGuide: z.array(z.string()).default([]),
  discussionQuestions: z.array(z.string()).default([]),
  conclusion: z.string().trim().min(2),
  prayerPoints: z.array(z.string()).default([]),
  studyHeading: z.string().trim().max(255).nullable().optional(),
  foodForThought: z.string().trim().nullable().optional(),
});

export const createSeriesSchema = z.object({
  title: z.string().trim().min(2).max(255),
  theme: z.string().trim().min(2).max(255).optional(),
  startDate: z.string().date(),
  academicSessionId: z.string().trim().min(1).optional(),
  lessons: z.array(seriesLessonSchema).min(1, "A series must include at least one lesson"),
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;