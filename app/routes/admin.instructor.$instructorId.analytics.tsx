import { Link, data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin.instructor.$instructorId.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getInstructorAnalytics } from "~/services/analyticsService";
import { parseParams } from "~/lib/validation";
import { UserRole } from "~/db/schema";
import { AnalyticsDashboard } from "~/components/analytics-dashboard";
import { Button } from "~/components/ui/button";
import { AlertTriangle } from "lucide-react";

const PeriodSchema = z.enum(["7d", "30d", "12m", "all"]).catch("30d");

const ParamsSchema = z.object({
  instructorId: z.coerce.number().int().positive(),
});

export function meta({ data: loaderData }: Route.MetaArgs) {
  const name = loaderData?.instructor.name;
  return [
    { title: name ? `${name} — Analytics — Cadence` : "Analytics — Cadence" },
    { name: "description", content: "Instructor revenue analytics" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const { instructorId } = parseParams(params, ParamsSchema);

  const instructor = getUserById(instructorId);

  if (!instructor || instructor.role !== UserRole.Instructor) {
    throw data("Instructor not found.", { status: 404 });
  }

  const url = new URL(request.url);
  const period = PeriodSchema.parse(url.searchParams.get("period") ?? undefined);

  const analytics = getInstructorAnalytics({ instructorId, period });

  return {
    period,
    analytics,
    instructor: { id: instructor.id, name: instructor.name },
  };
}

export default function AdminInstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { period, analytics, instructor } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/admin/users" className="hover:text-foreground">
          Manage Users
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{instructor.name}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{instructor.name}&rsquo;s Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Revenue and performance across all their courses
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
          : "Only admins can access this page.";
    } else if (error.status === 404) {
      title = "Not found";
      message =
        typeof error.data === "string" ? error.data : "Instructor not found.";
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
        <Link to="/admin/users">
          <Button>Back to Manage Users</Button>
        </Link>
      </div>
    </div>
  );
}
