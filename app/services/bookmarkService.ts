import { eq, and, inArray } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

export function toggleBookmark(opts: { userId: number; lessonId: number }): {
  bookmarked: boolean;
} {
  const existing = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();

  if (existing) {
    db.delete(lessonBookmarks).where(eq(lessonBookmarks.id, existing.id)).run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks)
    .values({ userId: opts.userId, lessonId: opts.lessonId })
    .run();
  return { bookmarked: true };
}

export function isLessonBookmarked(opts: {
  userId: number;
  lessonId: number;
}): boolean {
  const row = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();
  return !!row;
}

export function getBookmarkedLessonIds(opts: {
  userId: number;
  courseId: number;
}): number[] {
  const courseLessons = db
    .select({ lessonId: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, opts.courseId))
    .all();

  if (courseLessons.length === 0) return [];

  const lessonIds = courseLessons.map((r) => r.lessonId);

  const bookmarked = db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        inArray(lessonBookmarks.lessonId, lessonIds)
      )
    )
    .all();

  return bookmarked.map((r) => r.lessonId);
}
