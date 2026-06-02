import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { marked } from "marked";
import { MessageSquare, Reply, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { CommentWithUser } from "~/services/commentService";

marked.setOptions({ breaks: true });

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function renderMarkdown(body: string): string {
  return marked.parse(body) as string;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-6" : "size-8";
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={cn(dim, "rounded-full object-cover shrink-0")} />;
  }
  return (
    <div className={cn(dim, "rounded-full bg-primary/10 flex items-center justify-center shrink-0")}>
      <span className={cn("font-medium text-primary", size === "sm" ? "text-[10px]" : "text-xs")}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// ─── Comment Body (markdown) ──────────────────────────────────────────────────

function CommentBody({ body }: { body: string | null }) {
  if (!body) {
    return <p className="text-sm italic text-muted-foreground">[deleted]</p>;
  }
  return (
    <div
      className="prose prose-sm prose-neutral dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}

// ─── Comment Form ─────────────────────────────────────────────────────────────

function CommentForm({
  lessonId,
  parentId,
  initialBody = "",
  placeholder = "Write a comment… (Markdown supported)",
  submitLabel = "Post",
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  lessonId: number;
  parentId?: number;
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (body: string) => void;
  isSubmitting: boolean;
}) {
  const [body, setBody] = useState(initialBody);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isSubmitting}
        autoFocus={!!onCancel}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!body.trim() || isSubmitting}>
          {isSubmitting ? "Posting…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Replies Section ──────────────────────────────────────────────────────────

function RepliesSection({
  parentId,
  lessonId,
  initialReplies,
  initialTotal,
  currentUserId,
  instructorId,
  canComment,
  onReplyCreated,
}: {
  parentId: number;
  lessonId: number;
  initialReplies: CommentWithUser[];
  initialTotal: number;
  currentUserId: number | null;
  instructorId: number;
  canComment: boolean;
  onReplyCreated?: () => void;
}) {
  const [replies, setReplies] = useState<CommentWithUser[]>(initialReplies);
  const [total, setTotal] = useState(initialTotal);
  const [dbFetched, setDbFetched] = useState(initialReplies.length);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const loadMoreFetcher = useFetcher<{ comments: CommentWithUser[]; total: number }>({
    key: `load-replies-${parentId}`,
  });
  const createFetcher = useFetcher<{ comment: CommentWithUser }>({
    key: `create-reply-${parentId}`,
  });

  useEffect(() => {
    if (loadMoreFetcher.state === "idle" && loadMoreFetcher.data?.comments) {
      const { comments: incoming, total: newTotal } = loadMoreFetcher.data;
      setReplies((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...incoming.filter((r) => !seen.has(r.id))];
      });
      setDbFetched((prev) => prev + incoming.length);
      setTotal(newTotal);
    }
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.comment) {
      const newReply = createFetcher.data.comment;
      setReplies((prev) => (prev.some((r) => r.id === newReply.id) ? prev : [...prev, newReply]));
      setTotal((prev) => prev + 1);
      setShowReplyForm(false);
      onReplyCreated?.();
    }
  }, [createFetcher.state, createFetcher.data]);

  function handleCreateReply(body: string) {
    createFetcher.submit(
      JSON.stringify({ intent: "create", lessonId, parentId, body }),
      { method: "POST", action: "/api/lesson-comments", encType: "application/json" }
    );
  }

  function handleEdited(id: number, body: string, updatedAt: string) {
    setReplies((prev) => prev.map((r) => (r.id === id ? { ...r, body, updatedAt } : r)));
  }

  function handleDeleted(id: number, deletedAt: string) {
    setReplies((prev) => prev.map((r) => (r.id === id ? { ...r, body: null, deletedAt } : r)));
  }

  const hasMore = dbFetched < total;
  const isLoadingMore = loadMoreFetcher.state !== "idle";

  return (
    <div className="ml-10 mt-3 space-y-3 border-l-2 border-border pl-4">
      {replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          currentUserId={currentUserId}
          instructorId={instructorId}
          isReply
          canComment={false}
          onEdited={handleEdited}
          onDeleted={handleDeleted}
        />
      ))}

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          disabled={isLoadingMore}
          onClick={() =>
            loadMoreFetcher.load(`/api/lesson-comments?parentId=${parentId}&offset=${dbFetched}`)
          }
        >
          {isLoadingMore ? "Loading…" : `Load more replies (${total - dbFetched} remaining)`}
        </Button>
      )}

      {canComment && (
        showReplyForm ? (
          <CommentForm
            lessonId={lessonId}
            parentId={parentId}
            placeholder="Write a reply… (Markdown supported)"
            submitLabel="Reply"
            onCancel={() => setShowReplyForm(false)}
            onSubmit={handleCreateReply}
            isSubmitting={createFetcher.state !== "idle"}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-6 px-2"
            onClick={() => setShowReplyForm(true)}
          >
            <Reply className="size-3 mr-1" />
            Reply
          </Button>
        )
      )}
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  currentUserId,
  instructorId,
  isReply = false,
  canComment,
  onEdited,
  onDeleted,
}: {
  comment: CommentWithUser;
  currentUserId: number | null;
  instructorId: number;
  isReply?: boolean;
  canComment: boolean;
  onEdited: (id: number, body: string, updatedAt: string) => void;
  onDeleted: (id: number, deletedAt: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [initialReplies, setInitialReplies] = useState<CommentWithUser[]>([]);
  const [initialRepliesTotal, setInitialRepliesTotal] = useState(0);
  const [localReplyCount, setLocalReplyCount] = useState(comment.replyCount);

  const isDeleted = !!comment.deletedAt;
  const isEdited = !isDeleted && comment.createdAt !== comment.updatedAt;
  const isOwn = currentUserId === comment.userId;
  const isInstructor = comment.userId === instructorId;

  const editFetcher = useFetcher<{ comment: { id: number; body: string; updatedAt: string } }>({
    key: `edit-comment-${comment.id}`,
  });
  const deleteFetcher = useFetcher<{ success: boolean; commentId: number; deletedAt: string }>({
    key: `delete-comment-${comment.id}`,
  });
  const loadRepliesFetcher = useFetcher<{ comments: CommentWithUser[]; total: number }>({
    key: `initial-replies-${comment.id}`,
  });

  useEffect(() => {
    if (editFetcher.state === "idle" && editFetcher.data?.comment) {
      onEdited(comment.id, editFetcher.data.comment.body, editFetcher.data.comment.updatedAt);
      setEditing(false);
    }
  }, [editFetcher.state, editFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.success) {
      onDeleted(comment.id, deleteFetcher.data.deletedAt);
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  useEffect(() => {
    if (loadRepliesFetcher.state === "idle" && loadRepliesFetcher.data) {
      setInitialReplies(loadRepliesFetcher.data.comments);
      setInitialRepliesTotal(loadRepliesFetcher.data.total);
      setRepliesExpanded(true);
    }
  }, [loadRepliesFetcher.state, loadRepliesFetcher.data]);

  function handleEdit(body: string) {
    editFetcher.submit(
      JSON.stringify({ intent: "edit", commentId: comment.id, body }),
      { method: "POST", action: "/api/lesson-comments", encType: "application/json" }
    );
  }

  function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    deleteFetcher.submit(
      JSON.stringify({ intent: "delete", commentId: comment.id }),
      { method: "POST", action: "/api/lesson-comments", encType: "application/json" }
    );
  }

  function toggleReplies() {
    if (repliesExpanded) {
      setRepliesExpanded(false);
    } else if (initialReplies.length > 0) {
      setRepliesExpanded(true);
    } else {
      loadRepliesFetcher.load(`/api/lesson-comments?parentId=${comment.id}&offset=0`);
    }
  }

  const hasReplies = localReplyCount > 0;
  const isLoadingReplies = loadRepliesFetcher.state !== "idle";

  return (
    <div className="group">
      <div className="flex gap-3">
        <Avatar name={comment.authorName} avatarUrl={comment.authorAvatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
            <span className="text-sm font-medium">{comment.authorName}</span>
            {isInstructor && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Instructor
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
            {isEdited && <span className="text-xs text-muted-foreground">(edited)</span>}
          </div>

          {editing ? (
            <CommentForm
              lessonId={comment.lessonId}
              initialBody={comment.body ?? ""}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={handleEdit}
              isSubmitting={editFetcher.state !== "idle"}
            />
          ) : (
            <CommentBody body={comment.body} />
          )}

          {!editing && !isDeleted && (isOwn || !isReply) && (
            <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isReply && hasReplies && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={toggleReplies}
                  disabled={isLoadingReplies}
                >
                  {repliesExpanded ? (
                    <><ChevronUp className="size-3 mr-1" />{comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}</>
                  ) : (
                    <><ChevronDown className="size-3 mr-1" />{isLoadingReplies ? "Loading…" : `${localReplyCount} ${localReplyCount === 1 ? "reply" : "replies"}`}</>
                  )}
                </Button>
              )}
              {isOwn && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="size-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={handleDelete}
                    disabled={deleteFetcher.state !== "idle"}
                  >
                    <Trash2 className="size-3 mr-1" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}

          {!isReply && !editing && (
            <>
              {!hasReplies && canComment && !isDeleted && (
                <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setInitialReplies([]);
                      setInitialRepliesTotal(0);
                      setRepliesExpanded(true);
                    }}
                  >
                    <Reply className="size-3 mr-1" />
                    Reply
                  </Button>
                </div>
              )}

              {repliesExpanded && (
                <RepliesSection
                  parentId={comment.id}
                  lessonId={comment.lessonId}
                  initialReplies={initialReplies}
                  initialTotal={initialRepliesTotal}
                  currentUserId={currentUserId}
                  instructorId={instructorId}
                  canComment={canComment}
                  onReplyCreated={() => setLocalReplyCount((n) => n + 1)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lesson Comments (root) ───────────────────────────────────────────────────

export function LessonComments({
  lessonId,
  instructorId,
  currentUserId,
  canComment,
  initialComments,
  initialTotal,
}: {
  lessonId: number;
  instructorId: number;
  currentUserId: number | null;
  canComment: boolean;
  initialComments: CommentWithUser[];
  initialTotal: number;
}) {
  const [comments, setComments] = useState<CommentWithUser[]>(initialComments);
  const [total, setTotal] = useState(initialTotal);
  const [dbFetched, setDbFetched] = useState(initialComments.length);

  const createFetcher = useFetcher<{ comment: CommentWithUser }>({
    key: `create-comment-${lessonId}`,
  });
  const loadMoreFetcher = useFetcher<{ comments: CommentWithUser[]; total: number }>({
    key: `load-more-${lessonId}`,
  });

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.comment) {
      const c = createFetcher.data.comment;
      setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      setTotal((prev) => prev + 1);
    }
  }, [createFetcher.state, createFetcher.data]);

  useEffect(() => {
    if (loadMoreFetcher.state === "idle" && loadMoreFetcher.data?.comments) {
      const { comments: incoming, total: newTotal } = loadMoreFetcher.data;
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...incoming.filter((c) => !seen.has(c.id))];
      });
      setDbFetched((prev) => prev + incoming.length);
      setTotal(newTotal);
    }
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  function handleCreate(body: string) {
    createFetcher.submit(
      JSON.stringify({ intent: "create", lessonId, body }),
      { method: "POST", action: "/api/lesson-comments", encType: "application/json" }
    );
  }

  function handleEdited(id: number, body: string, updatedAt: string) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body, updatedAt } : c)));
  }

  function handleDeleted(id: number, deletedAt: string) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: null, deletedAt } : c)));
  }

  const hasMore = dbFetched < total;
  const isLoadingMore = loadMoreFetcher.state !== "idle";

  return (
    <div className="mt-10 border-t pt-8">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="size-5" />
        <h2 className="text-lg font-semibold">
          Discussion{total > 0 ? ` (${total})` : ""}
        </h2>
      </div>

      <div className="space-y-6">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            instructorId={instructorId}
            canComment={canComment}
            onEdited={handleEdited}
            onDeleted={handleDeleted}
          />
        ))}

        {comments.length === 0 && total === 0 && (
          <p className="text-sm text-muted-foreground">
            No comments yet.{canComment ? " Be the first!" : ""}
          </p>
        )}

        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            disabled={isLoadingMore}
            onClick={() =>
              loadMoreFetcher.load(`/api/lesson-comments?lessonId=${lessonId}&offset=${dbFetched}`)
            }
          >
            {isLoadingMore ? "Loading…" : `Load more comments (${total - dbFetched} remaining)`}
          </Button>
        )}
      </div>

      {canComment ? (
        <div className="mt-8">
          <h3 className="text-sm font-medium mb-3">Add a comment</h3>
          <CommentForm
            lessonId={lessonId}
            onSubmit={handleCreate}
            isSubmitting={createFetcher.state !== "idle"}
          />
        </div>
      ) : currentUserId === null ? (
        <p className="mt-6 text-sm text-muted-foreground">Sign in and enroll to join the discussion.</p>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Enroll in this course to join the discussion.</p>
      )}
    </div>
  );
}
