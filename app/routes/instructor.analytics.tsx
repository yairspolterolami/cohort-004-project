import { Link, data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getInstructorAnalytics } from "~/services/analyticsService";
import { UserRole } from "~/db/schema";
import { AnalyticsDashboard } from "~/components/analytics-dashboard";
import { Button } from "~/components/ui/button";
import { AlertTriangle } from "lucide-react";

const PeriodSchema = z.enum(["7d", "30d", "12m", "all"]).catch("30d");

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Revenue analytics for your courses" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view your analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  const url = new URL(request.url);
  const period = PeriodSchema.parse(url.searchParams.get("period") ?? undefined);

  const analytics = getInstructorAnalytics({
    instructorId: currentUserId,
    period,
  });

  return { period, analytics };
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { period, analytics } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Revenue and performance across all your courses
        </p>
      </div>

      <AnalyticsDashboard analytics={analytics} period={period} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/instructor">
          <Button>Back to My Courses</Button>
        </Link>
      </div>
    </div>
  );
}
