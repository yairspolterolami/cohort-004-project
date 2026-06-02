import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.lesson-comments";
import { getCurrentUserId } from "~/lib/session";
import { parseJsonBody } from "~/lib/validation";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getCourseById } from "~/services/courseService";
import {
  getTopLevelComments,
  getReplies,
  getCommentById,
  getCommentWithUser,
  createComment,
  updateComment,
  softDeleteComment,
} from "~/services/commentService";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lessonIdParam = url.searchParams.get("lessonId");
  const parentIdParam = url.searchParams.get("parentId");
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  if (parentIdParam) {
    return getReplies(Number(parentIdParam), offset, 5);
  }

  if (lessonIdParam) {
    return getTopLevelComments(Number(lessonIdParam), offset, 10);
  }

  throw data("Missing lessonId or parentId", { status: 400 });
}

const createSchema = z.object({
  intent: z.literal("create"),
  lessonId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
  body: z.string().min(1).max(5000).trim(),
});

const editSchema = z.object({
  intent: z.literal("edit"),
  commentId: z.number().int().positive(),
  body: z.string().min(1).max(5000).trim(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  commentId: z.number().int().positive(),
});

const bodySchema = z.discriminatedUnion("intent", [
  createSchema,
  editSchema,
  deleteSchema,
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { intent } = parsed.data;

  if (intent === "create") {
    const { lessonId, parentId, body } = parsed.data;

    if (parentId != null) {
      const parent = getCommentById(parentId);
      if (!parent) throw data("Parent comment not found", { status: 404 });
      if (parent.parentId != null) throw data("Cannot reply to a reply", { status: 400 });
    }

    const lesson = getLessonById(lessonId);
    if (!lesson) throw data("Lesson not found", { status: 404 });
    const mod = getModuleById(lesson.moduleId);
    if (!mod) throw data("Module not found", { status: 404 });
    const course = getCourseById(mod.courseId);
    if (!course) throw data("Course not found", { status: 404 });

    const isInstructor = course.instructorId === currentUserId;
    if (!isInstructor && !isUserEnrolled(currentUserId, course.id)) {
      throw data("You must be enrolled to comment", { status: 403 });
    }

    const raw = createComment(currentUserId, lessonId, parentId ?? null, body);
    const comment = getCommentWithUser(raw.id);
    return { comment };
  }

  if (intent === "edit") {
    const { commentId, body } = parsed.data;
    const comment = getCommentById(commentId);
    if (!comment) throw data("Comment not found", { status: 404 });
    if (comment.userId !== currentUserId) throw data("Forbidden", { status: 403 });
    if (comment.deletedAt) throw data("Cannot edit a deleted comment", { status: 400 });
    const updated = updateComment(commentId, body);
    return { comment: { id: updated!.id, body: updated!.body, updatedAt: updated!.updatedAt } };
  }

  if (intent === "delete") {
    const { commentId } = parsed.data;
    const comment = getCommentById(commentId);
    if (!comment) throw data("Comment not found", { status: 404 });
    if (comment.userId !== currentUserId) throw data("Forbidden", { status: 403 });
    const deleted = softDeleteComment(commentId);
    return { success: true, commentId, deletedAt: deleted!.deletedAt };
  }

  throw data("Invalid intent", { status: 400 });
}
