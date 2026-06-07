import { Link, useSearchParams } from "react-router";
import { DollarSign, Star, Users } from "lucide-react";
import { cn, formatPrice } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type {
  AnalyticsPeriod,
  InstructorAnalytics,
} from "~/services/analyticsService";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

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

export function AnalyticsDashboard({
  analytics,
  period,
}: {
  analytics: InstructorAnalytics;
  period: AnalyticsPeriod;
}) {
  const { summary } = analytics;

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
    </div>
  );
}
