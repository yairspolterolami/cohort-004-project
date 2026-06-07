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

/** A single point on the revenue-over-time chart. */
export interface RevenueDataPoint {
  /** Bucket key — "YYYY-MM-DD" for daily granularity, "YYYY-MM" for monthly. */
  date: string;
  /** Revenue in cents for this bucket (0 for periods with no sales). */
  revenue: number;
}

/** Per-course breakdown row for the analytics table. */
export interface CourseBreakdown {
  courseId: number;
  title: string;
  /** List price in cents (courses.price). */
  listPrice: number;
  /** Revenue in cents (sum of purchases.pricePaid) for the period. */
  revenue: number;
  /** Number of purchases for the period. */
  salesCount: number;
  /** Number of enrollments for the period. */
  enrollmentCount: number;
  /** Average rating (1-5, rounded to 1 decimal) for the period, or null. */
  averageRating: number | null;
  /** Number of ratings for the period. */
  ratingCount: number;
}

export interface InstructorAnalytics {
  summary: AnalyticsSummary;
  timeSeries: RevenueDataPoint[];
  courses: CourseBreakdown[];
}

type Granularity = "daily" | "monthly";

function granularityFor(period: AnalyticsPeriod): Granularity {
  return period === "7d" || period === "30d" ? "daily" : "monthly";
}

/** Every "YYYY-MM-DD" key from startKey through endKey, inclusive. */
function eachDay(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  const cur = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  while (cur <= end) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

/** Every "YYYY-MM" key from startKey through endKey, inclusive. */
function eachMonth(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, 1));
  const end = new Date(Date.UTC(ey, em - 1, 1));
  while (cur <= end) {
    keys.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return keys;
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

  const instructorCourses = db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();
  const courseIds = instructorCourses.map((c) => c.id);

  if (courseIds.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalEnrollments: 0,
        averageRating: null,
        ratingCount: 0,
      },
      timeSeries: [],
      courses: [],
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

  // ─── Revenue time series ───
  // Bucket revenue by day or month (per the period's granularity), then fill
  // every bucket in the window so zero-revenue periods render as $0 — no gaps.
  const granularity = granularityFor(period);
  const bucketLen = granularity === "daily" ? 10 : 7;
  const bucketExpr = sql<string>`substr(${purchases.createdAt}, 1, ${bucketLen})`;
  const bucketRows = db
    .select({
      bucket: bucketExpr,
      revenue: sql<number>`sum(${purchases.pricePaid})`,
    })
    .from(purchases)
    .where(and(...revenueConds))
    .groupBy(bucketExpr)
    .all();
  const revenueByBucket = new Map(bucketRows.map((r) => [r.bucket, r.revenue]));

  const nowKey = now.toISOString().slice(0, bucketLen);
  let startKey: string | null;
  if (cutoff) {
    startKey = cutoff.slice(0, bucketLen);
  } else {
    // "All time": start at the instructor's first purchase, or skip the series
    // entirely if there are none.
    const first = db
      .select({ earliest: sql<string | null>`min(${purchases.createdAt})` })
      .from(purchases)
      .where(inArray(purchases.courseId, courseIds))
      .get();
    startKey = first?.earliest ? first.earliest.slice(0, bucketLen) : null;
  }

  let bucketKeys: string[] = [];
  if (startKey) {
    bucketKeys =
      granularity === "daily"
        ? eachDay(startKey, nowKey)
        : eachMonth(startKey, nowKey);
  }
  const timeSeries: RevenueDataPoint[] = bucketKeys.map((date) => ({
    date,
    revenue: revenueByBucket.get(date) ?? 0,
  }));

  // ─── Per-course breakdown ───
  // Aggregate each metric by course, then stitch onto the instructor's courses
  // so courses with no sales/enrollments/ratings still appear (as zeros).
  const revenueByCourse = new Map(
    db
      .select({
        courseId: purchases.courseId,
        revenue: sql<number>`sum(${purchases.pricePaid})`,
        sales: sql<number>`count(*)`,
      })
      .from(purchases)
      .where(and(...revenueConds))
      .groupBy(purchases.courseId)
      .all()
      .map((r) => [r.courseId, r])
  );
  const enrollmentsByCourse = new Map(
    db
      .select({
        courseId: enrollments.courseId,
        count: sql<number>`count(*)`,
      })
      .from(enrollments)
      .where(and(...enrollmentConds))
      .groupBy(enrollments.courseId)
      .all()
      .map((r) => [r.courseId, r.count])
  );
  const ratingsByCourse = new Map(
    db
      .select({
        courseId: courseRatings.courseId,
        average: sql<number | null>`avg(${courseRatings.rating})`,
        count: sql<number>`count(*)`,
      })
      .from(courseRatings)
      .where(and(...ratingConds))
      .groupBy(courseRatings.courseId)
      .all()
      .map((r) => [r.courseId, r])
  );

  const courseBreakdowns: CourseBreakdown[] = instructorCourses.map((c) => {
    const rev = revenueByCourse.get(c.id);
    const rating = ratingsByCourse.get(c.id);
    return {
      courseId: c.id,
      title: c.title,
      listPrice: c.price,
      revenue: rev?.revenue ?? 0,
      salesCount: rev?.sales ?? 0,
      enrollmentCount: enrollmentsByCourse.get(c.id) ?? 0,
      averageRating: rating?.average
        ? Math.round(rating.average * 10) / 10
        : null,
      ratingCount: rating?.count ?? 0,
    };
  });

  return {
    summary: {
      totalRevenue: revenueRow?.total ?? 0,
      totalEnrollments: enrollmentRow?.count ?? 0,
      averageRating: ratingRow?.average
        ? Math.round(ratingRow.average * 10) / 10
        : null,
      ratingCount: ratingRow?.count ?? 0,
    },
    timeSeries,
    courses: courseBreakdowns,
  };
}
