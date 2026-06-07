import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, purchases, enrollments, courseRatings } from "~/db/schema";

// ─── Analytics Service ───
// Deep module behind a single entry point: given an instructor and a time
// period, returns all data the analytics dashboard needs. Complex SQL
// aggregations live here, behind a simple interface. The return type is
// designed to be extended (additional metrics, time series, per-course
// breakdowns) without changing the existing shape.

export type AnalyticsPeriod = "7d" | "30d" | "12m" | "all";

export interface AnalyticsSummary {
  /** Total revenue in cents (sum of purchases.pricePaid) for the period. */
  totalRevenue: number;
  /** Total enrollment count for the period. */
  totalEnrollments: number;
  /** Average course rating (1-5, rounded to 1 decimal) for the period, or null if no ratings. */
  averageRating: number | null;
  /** Number of ratings the average is based on. */
  ratingCount: number;
}

export interface InstructorAnalytics {
  summary: AnalyticsSummary;
}

/**
 * Returns the lower-bound ISO timestamp for a period, or null for "all time"
 * (no lower bound). ISO strings sort lexicographically, so the result can be
 * compared directly against stored `text` timestamp columns.
 */
function getCutoff(period: AnalyticsPeriod, now: Date): string | null {
  if (period === "all") return null;
  const cutoff = new Date(now);
  if (period === "7d") cutoff.setDate(cutoff.getDate() - 7);
  else if (period === "30d") cutoff.setDate(cutoff.getDate() - 30);
  else if (period === "12m") cutoff.setMonth(cutoff.getMonth() - 12);
  return cutoff.toISOString();
}

/**
 * Returns the dashboard analytics for a single instructor, scoped to a time
 * period. All data is restricted to courses owned by `instructorId`, enforcing
 * instructor isolation at the data layer.
 *
 * `now` is injectable for deterministic tests; it defaults to the current time.
 */
export function getInstructorAnalytics(opts: {
  instructorId: number;
  period: AnalyticsPeriod;
  now?: Date;
}): InstructorAnalytics {
  const { instructorId, period, now = new Date() } = opts;
  const cutoff = getCutoff(period, now);

  const courseIds = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all()
    .map((c) => c.id);

  if (courseIds.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalEnrollments: 0,
        averageRating: null,
        ratingCount: 0,
      },
    };
  }

  // ─── Revenue ───
  const revenueConds = [inArray(purchases.courseId, courseIds)];
  if (cutoff) revenueConds.push(gte(purchases.createdAt, cutoff));
  const revenueRow = db
    .select({ total: sql<number | null>`sum(${purchases.pricePaid})` })
    .from(purchases)
    .where(and(...revenueConds))
    .get();

  // ─── Enrollments ───
  const enrollmentConds = [inArray(enrollments.courseId, courseIds)];
  if (cutoff) enrollmentConds.push(gte(enrollments.enrolledAt, cutoff));
  const enrollmentRow = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(...enrollmentConds))
    .get();

  // ─── Ratings ───
  const ratingConds = [inArray(courseRatings.courseId, courseIds)];
  if (cutoff) ratingConds.push(gte(courseRatings.createdAt, cutoff));
  const ratingRow = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(and(...ratingConds))
    .get();

  return {
    summary: {
      totalRevenue: revenueRow?.total ?? 0,
      totalEnrollments: enrollmentRow?.count ?? 0,
      averageRating: ratingRow?.average
        ? Math.round(ratingRow.average * 10) / 10
        : null,
      ratingCount: ratingRow?.count ?? 0,
    },
  };
}
