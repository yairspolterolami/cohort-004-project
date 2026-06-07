import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import { getInstructorAnalytics } from "./analyticsService";

// Fixed reference point so period cutoffs are deterministic.
//   7d  cutoff → 2026-05-31
//   30d cutoff → 2026-05-08
//   12m cutoff → 2025-06-07
const NOW = new Date("2026-06-07T00:00:00.000Z");

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function insertPurchase(opts: {
  userId: number;
  courseId: number;
  pricePaid: number;
  createdAt: string;
}) {
  return testDb.insert(schema.purchases).values(opts).returning().get();
}

function insertEnrollment(opts: {
  userId: number;
  courseId: number;
  enrolledAt: string;
}) {
  return testDb.insert(schema.enrollments).values(opts).returning().get();
}

function insertRating(opts: {
  userId: number;
  courseId: number;
  rating: number;
  createdAt: string;
}) {
  return testDb.insert(schema.courseRatings).values(opts).returning().get();
}

function makeStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getInstructorAnalytics — summary totals", () => {
    it("sums revenue across the instructor's courses for the period", () => {
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(2),
      });
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 3000,
        createdAt: daysAgo(3),
      });

      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      expect(summary.totalRevenue).toBe(8000);
    });

    it("counts enrollments for the period", () => {
      insertEnrollment({
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: daysAgo(1),
      });
      const student2 = makeStudent("s2@example.com");
      insertEnrollment({
        userId: student2.id,
        courseId: base.course.id,
        enrolledAt: daysAgo(4),
      });

      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      expect(summary.totalEnrollments).toBe(2);
    });

    it("averages ratings and reports the rating count for the period", () => {
      const student2 = makeStudent("s2@example.com");
      insertRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 5,
        createdAt: daysAgo(1),
      });
      insertRating({
        userId: student2.id,
        courseId: base.course.id,
        rating: 4,
        createdAt: daysAgo(2),
      });

      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      expect(summary.averageRating).toBe(4.5);
      expect(summary.ratingCount).toBe(2);
    });
  });

  describe("getInstructorAnalytics — time period filtering", () => {
    it("excludes data older than the period window", () => {
      // Inside 7d
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(3),
      });
      // Outside 7d, inside 30d
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 9000,
        createdAt: daysAgo(20),
      });

      const sevenDay = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });
      expect(sevenDay.summary.totalRevenue).toBe(5000);

      const thirtyDay = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "30d",
        now: NOW,
      });
      expect(thirtyDay.summary.totalRevenue).toBe(14000);
    });

    it("includes a purchase exactly at the period boundary", () => {
      // 7d cutoff is exactly daysAgo(7); gte should include it.
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 2500,
        createdAt: daysAgo(7),
      });

      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      expect(summary.totalRevenue).toBe(2500);
    });

    it("'all' includes data of any age", () => {
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 7000,
        createdAt: daysAgo(800),
      });

      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "all",
        now: NOW,
      });

      expect(summary.totalRevenue).toBe(7000);
    });
  });

  describe("getInstructorAnalytics — instructor isolation", () => {
    it("only counts data for courses owned by the instructor", () => {
      // A second instructor with their own course + purchase.
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Not mine",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(1),
      });
      insertPurchase({
        userId: base.user.id,
        courseId: otherCourse.id,
        pricePaid: 9999,
        createdAt: daysAgo(1),
      });

      const mine = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "30d",
        now: NOW,
      });
      expect(mine.summary.totalRevenue).toBe(5000);

      const theirs = getInstructorAnalytics({
        instructorId: otherInstructor.id,
        period: "30d",
        now: NOW,
      });
      expect(theirs.summary.totalRevenue).toBe(9999);
    });
  });

  describe("getInstructorAnalytics — edge cases", () => {
    it("returns zeros and null rating for an instructor with no courses", () => {
      const lonely = testDb
        .insert(schema.users)
        .values({
          name: "No Courses",
          email: "nocourses@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const { summary } = getInstructorAnalytics({
        instructorId: lonely.id,
        period: "30d",
        now: NOW,
      });

      expect(summary.totalRevenue).toBe(0);
      expect(summary.totalEnrollments).toBe(0);
      expect(summary.averageRating).toBeNull();
      expect(summary.ratingCount).toBe(0);
    });

    it("returns zero revenue when courses exist but have no purchases", () => {
      const { summary } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "30d",
        now: NOW,
      });

      expect(summary.totalRevenue).toBe(0);
      expect(summary.averageRating).toBeNull();
    });
  });

  describe("getInstructorAnalytics — revenue time series", () => {
    it("buckets revenue by day for the 7d period, one point per day", () => {
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(2),
      });
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 3000,
        createdAt: daysAgo(2),
      });

      const { timeSeries } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      // 7d window: cutoff day (2026-05-31) through today (2026-06-07) = 8 days.
      expect(timeSeries).toHaveLength(8);
      // Daily keys are "YYYY-MM-DD".
      expect(timeSeries.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))).toBe(
        true
      );
      // The two purchases land in the same day bucket and sum.
      const day = daysAgo(2).slice(0, 10);
      const point = timeSeries.find((p) => p.date === day);
      expect(point?.revenue).toBe(8000);
    });

    it("fills zero-revenue days as $0 so the line has no gaps", () => {
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(1),
      });

      const { timeSeries } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      // Every bucket is present; the days without a purchase read 0, not absent.
      const withRevenue = timeSeries.filter((p) => p.revenue > 0);
      expect(withRevenue).toHaveLength(1);
      expect(timeSeries.filter((p) => p.revenue === 0).length).toBeGreaterThan(
        0
      );
    });

    it("buckets revenue by month for the 12m period", () => {
      // daysAgo(3) = 2026-06-04 → current month (2026-06).
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 4000,
        createdAt: daysAgo(3),
      });
      // daysAgo(40) = 2026-04-28 → a prior month.
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 1000,
        createdAt: daysAgo(40),
      });

      const { timeSeries } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "12m",
        now: NOW,
      });

      // 12m window: 12 months ago (2025-06) through now (2026-06) = 13 months.
      expect(timeSeries).toHaveLength(13);
      // Monthly keys are "YYYY-MM".
      expect(timeSeries.every((p) => /^\d{4}-\d{2}$/.test(p.date))).toBe(true);
      const currentMonth = NOW.toISOString().slice(0, 7);
      expect(timeSeries.find((p) => p.date === currentMonth)?.revenue).toBe(
        4000
      );
      const priorMonth = daysAgo(40).slice(0, 7);
      expect(timeSeries.find((p) => p.date === priorMonth)?.revenue).toBe(1000);
    });

    it("'all' starts the series at the instructor's first purchase month", () => {
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 2000,
        createdAt: daysAgo(60),
      });

      const { timeSeries } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "all",
        now: NOW,
      });

      const firstMonth = daysAgo(60).slice(0, 7);
      const currentMonth = NOW.toISOString().slice(0, 7);
      expect(timeSeries[0]?.date).toBe(firstMonth);
      expect(timeSeries[timeSeries.length - 1]?.date).toBe(currentMonth);
    });

    it("returns an empty series for 'all' when there are no purchases", () => {
      const { timeSeries } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "all",
        now: NOW,
      });

      expect(timeSeries).toEqual([]);
    });
  });

  describe("getInstructorAnalytics — per-course breakdown", () => {
    it("attributes revenue, sales, enrollments, and ratings to each course", () => {
      // A second course owned by the same instructor.
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Also mine",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
          price: 9900,
        })
        .returning()
        .get();

      // Course 1: two sales, one enrollment, one rating.
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: daysAgo(2),
      });
      insertPurchase({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 4000,
        createdAt: daysAgo(3),
      });
      insertEnrollment({
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: daysAgo(2),
      });
      insertRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 4,
        createdAt: daysAgo(2),
      });

      // Course 2: one sale, no enrollments, two ratings.
      const student2 = makeStudent("s2@example.com");
      insertPurchase({
        userId: student2.id,
        courseId: course2.id,
        pricePaid: 9900,
        createdAt: daysAgo(1),
      });
      insertRating({
        userId: base.user.id,
        courseId: course2.id,
        rating: 5,
        createdAt: daysAgo(1),
      });
      insertRating({
        userId: student2.id,
        courseId: course2.id,
        rating: 4,
        createdAt: daysAgo(1),
      });

      const { courses } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "7d",
        now: NOW,
      });

      const c1 = courses.find((c) => c.courseId === base.course.id);
      const c2 = courses.find((c) => c.courseId === course2.id);

      expect(c1).toMatchObject({
        revenue: 9000,
        salesCount: 2,
        enrollmentCount: 1,
        averageRating: 4,
        ratingCount: 1,
      });
      expect(c2).toMatchObject({
        title: "Second Course",
        listPrice: 9900,
        revenue: 9900,
        salesCount: 1,
        enrollmentCount: 0,
        averageRating: 4.5,
        ratingCount: 2,
      });
    });

    it("includes courses with no activity as zero rows", () => {
      const { courses } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "30d",
        now: NOW,
      });

      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({
        courseId: base.course.id,
        revenue: 0,
        salesCount: 0,
        enrollmentCount: 0,
        averageRating: null,
        ratingCount: 0,
      });
    });

    it("only includes courses owned by the instructor", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other2@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      testDb
        .insert(schema.courses)
        .values({
          title: "Not Mine",
          slug: "not-mine",
          description: "x",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const { courses } = getInstructorAnalytics({
        instructorId: base.instructor.id,
        period: "30d",
        now: NOW,
      });

      expect(courses).toHaveLength(1);
      expect(courses[0].courseId).toBe(base.course.id);
    });
  });
});
