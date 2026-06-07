import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown, DollarSign, Star, Users } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatPrice } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type {
  AnalyticsPeriod,
  CourseBreakdown,
  InstructorAnalytics,
  RevenueDataPoint,
} from "~/services/analyticsService";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

/**
 * Revenue in dollars, always "$X.XX" (unlike `formatPrice`, which renders 0 as
 * "Free"). Used for chart axes/tooltips and the revenue column, where a $0
 * data point should read as a real zero, not "Free".
 */
function formatRevenue(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Compact axis label, e.g. "Jun 4" (daily) or "Jun 2026" (monthly). */
function formatBucketLabel(key: string): string {
  if (key.length === 7) {
    // "YYYY-MM"
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  // "YYYY-MM-DD"
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function PeriodSelector({ period }: { period: AnalyticsPeriod }) {
  const [searchParams] = useSearchParams();

  return (
    <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-1">
      {PERIODS.map((p) => {
        const next = new URLSearchParams(searchParams);
        next.set("period", p.value);
        const isActive = p.value === period;
        return (
          <Link
            key={p.value}
            to={`?${next.toString()}`}
            preventScrollReset
            className={cn(
              "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtext,
  icon,
}: {
  title: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtext && (
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RevenueChart({ data }: { data: RevenueDataPoint[] }) {
  // recharts' ResponsiveContainer measures the DOM, so it only works after
  // mount. Render a placeholder server-side / pre-hydration to avoid a
  // mismatch, then swap in the chart on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatBucketLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  className="text-xs"
                  stroke="currentColor"
                />
                <YAxis
                  tickFormatter={(cents: number) =>
                    `$${(cents / 100).toLocaleString()}`
                  }
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  className="text-xs"
                  stroke="currentColor"
                />
                <Tooltip
                  formatter={(value) => [
                    formatRevenue(Number(value)),
                    "Revenue",
                  ]}
                  labelFormatter={(label) => formatBucketLabel(String(label))}
                  contentStyle={{
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    fontSize: "0.75rem",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type SortKey = keyof Pick<
  CourseBreakdown,
  | "title"
  | "listPrice"
  | "revenue"
  | "salesCount"
  | "enrollmentCount"
  | "averageRating"
  | "ratingCount"
>;
type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
}[] = [
  { key: "title", label: "Course", numeric: false },
  { key: "listPrice", label: "List Price", numeric: true },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "salesCount", label: "Sales", numeric: true },
  { key: "enrollmentCount", label: "Enrollments", numeric: true },
  { key: "averageRating", label: "Avg Rating", numeric: true },
  { key: "ratingCount", label: "Ratings", numeric: true },
];

function CourseTable({ courses }: { courses: CourseBreakdown[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const rows = [...courses];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        // Nulls (no rating) sort below real numbers.
        const an = av ?? -Infinity;
        const bn = bv ?? -Infinity;
        cmp = (an as number) - (bn as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [courses, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text defaults to A→Z; numbers default to high→low.
      setSortDir(key === "title" ? "asc" : "desc");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-course breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                {COLUMNS.map((col) => {
                  const active = col.key === sortKey;
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "py-2 font-medium",
                        col.numeric ? "text-right" : "text-left"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          col.numeric && "flex-row-reverse",
                          active && "text-foreground"
                        )}
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.courseId} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{c.title}</td>
                  <td className="py-3 text-right tabular-nums">
                    {formatPrice(c.listPrice)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatRevenue(c.revenue)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.salesCount}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.enrollmentCount}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.averageRating === null
                      ? "—"
                      : c.averageRating.toFixed(1)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.ratingCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard({
  analytics,
  period,
}: {
  analytics: InstructorAnalytics;
  period: AnalyticsPeriod;
}) {
  const { summary, timeSeries, courses } = analytics;

  return (
    <div className="space-y-6">
      <PeriodSelector period={period} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Total Revenue"
          value={formatPrice(summary.totalRevenue)}
          icon={<DollarSign className="size-4" />}
        />
        <SummaryCard
          title="Total Enrollments"
          value={String(summary.totalEnrollments)}
          icon={<Users className="size-4" />}
        />
        <SummaryCard
          title="Average Rating"
          value={
            summary.averageRating === null
              ? "—"
              : summary.averageRating.toFixed(1)
          }
          subtext={
            summary.ratingCount === 1
              ? "1 rating"
              : `${summary.ratingCount} ratings`
          }
          icon={<Star className="size-4" />}
        />
      </div>

      <RevenueChart data={timeSeries} />

      <CourseTable courses={courses} />
    </div>
  );
}
