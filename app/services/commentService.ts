import { eq, and, isNull, sql, asc, inArray } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users } from "~/db/schema";

export type CommentWithUser = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  body: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
  replyCount: number;
};

const commentWithUserSelect = {
  id: lessonComments.id,
  lessonId: lessonComments.lessonId,
  userId: lessonComments.userId,
  parentId: lessonComments.parentId,
  body: lessonComments.body,
  deletedAt: lessonComments.deletedAt,
  createdAt: lessonComments.createdAt,
  updatedAt: lessonComments.updatedAt,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
};

function maskDeleted(
  row: Omit<CommentWithUser, "replyCount"> & { replyCount?: number }
): CommentWithUser {
  return {
    ...row,
    body: row.deletedAt ? null : row.body,
    replyCount: row.replyCount ?? 0,
  };
}

export function getTopLevelComments(
  lessonId: number,
  offset: number,
  limit: number
): { comments: CommentWithUser[]; total: number } {
  const condition = and(
    eq(lessonComments.lessonId, lessonId),
    isNull(lessonComments.parentId)
  );

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(condition)
    .get();
  const total = totalRow?.count ?? 0;

  const rows = db
    .select(commentWithUserSelect)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(condition)
    .orderBy(asc(lessonComments.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const ids = rows.map((r) => r.id);
  const replyCounts =
    ids.length > 0
      ? db
          .select({
            parentId: lessonComments.parentId,
            count: sql<number>`count(*)`,
          })
          .from(lessonComments)
          .where(inArray(lessonComments.parentId, ids))
          .groupBy(lessonComments.parentId)
          .all()
      : [];

  const replyCountMap = new Map(replyCounts.map((r) => [r.parentId!, r.count]));

  return {
    comments: rows.map((r) =>
      maskDeleted({ ...r, replyCount: replyCountMap.get(r.id) ?? 0 })
    ),
    total,
  };
}

export function getReplies(
  parentId: number,
  offset: number,
  limit: number
): { comments: CommentWithUser[]; total: number } {
  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(eq(lessonComments.parentId, parentId))
    .get();
  const total = totalRow?.count ?? 0;

  const rows = db
    .select(commentWithUserSelect)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.parentId, parentId))
    .orderBy(asc(lessonComments.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    comments: rows.map((r) => maskDeleted({ ...r, replyCount: 0 })),
    total,
  };
}

export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get() ?? null;
}

export function getCommentWithUser(id: number): CommentWithUser | null {
  const row = db
    .select(commentWithUserSelect)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.id, id))
    .get();
  return row ? maskDeleted({ ...row, replyCount: 0 }) : null;
}

export function createComment(
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
) {
  const now = new Date().toISOString();
  return db
    .insert(lessonComments)
    .values({ userId, lessonId, parentId, body, createdAt: now, updatedAt: now })
    .returning()
    .get();
}

export function updateComment(id: number, body: string) {
  return db
    .update(lessonComments)
    .set({ body, updatedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}

export function softDeleteComment(id: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}
