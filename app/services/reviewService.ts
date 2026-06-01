import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";

export function upsertCourseReview(userId: number, courseId: number, rating: number) {
  const now = new Date().toISOString();
  return db
    .insert(courseReviews)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseReviews.userId, courseReviews.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

export function getUserCourseReview(userId: number, courseId: number) {
  return (
    db
      .select()
      .from(courseReviews)
      .where(
        and(
          eq(courseReviews.userId, userId),
          eq(courseReviews.courseId, courseId)
        )
      )
      .get() ?? null
  );
}

export function getCourseRatingStats(courseId: number): {
  avg: number | null;
  count: number;
} {
  const result = db
    .select({
      avg: sql<number | null>`NULLIF(ROUND(AVG(${courseReviews.rating}), 1), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return { avg: result?.avg ?? null, count: result?.count ?? 0 };
}

export function getRatingStatsForCourses(
  courseIds: number[]
): Map<number, { avg: number; count: number }> {
  if (courseIds.length === 0) return new Map();

  const results = db
    .select({
      courseId: courseReviews.courseId,
      avg: sql<number>`ROUND(AVG(${courseReviews.rating}), 1)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  return new Map(results.map((r) => [r.courseId, { avg: r.avg, count: r.count }]));
}
