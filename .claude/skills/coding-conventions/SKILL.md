---
name: coding-conventions
description: Project coding conventions for this codebase. Use when writing or modifying TypeScript, React Router routes, Drizzle schema, or test files in this project.
---

# Coding Conventions

## TypeScript

- No `any`. Check the Drizzle schema or use `typeof` inference if unsure of a type.
- When a function has more than one parameter of the same type, use an object parameter:
  ```ts
  // BAD
  const addUserToPost = (userId: string, postId: string) => {};
  // GOOD
  const addUserToPost = (opts: { userId: string; postId: string }) => {};
  ```
- Use `~/*` import alias for anything inside `/app`. Never use relative imports like `../../lib/utils`.

## Database (SQLite + Drizzle)

- DB ids: `integer().primaryKey({ autoIncrement: true })`. No UUIDs.
- Timestamps: stored as ISO strings in `text` columns. Default: `$defaultFn(() => new Date().toISOString())`.
- Booleans: `integer("col_name", { mode: "boolean" })`.
- Soft deletes: nullable `text("deleted_at")` column. Never delete rows. See `lessonComments` in schema.
- Price values: stored in cents (integers). Display with `formatPrice()` from `~/lib/utils`.
- Don't create new `Database` connections in service code — use the singleton in `app/db/index.ts`.

## Services

- Files named `*Service.ts` must have an accompanying `.test.ts` file.
- For discriminated results (not validation), return `{ ok: true, ... } | { ok: false, error: string }`. See `couponService` for reference.

## React Router v7

- Routes go in `app/routes/`. Each file can export `loader`, `action`, `default`, `meta`, `ErrorBoundary`.
- No business logic in routes — call into services instead.
- Form validation in actions: use `parseFormData(formData, zodSchema)` from `~/lib/validation`. Returns `{ success, data, errors }`. Use `parseParams` for route params, `parseJsonBody` for JSON bodies.
- Multiple form submissions on one route: use Zod discriminated unions on an `intent` field:
  ```ts
  const schema = z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("mark-complete") }),
    z.object({ intent: z.literal("delete-comment"), commentId: z.coerce.number() }),
  ]);
  ```

## Auth

- Cookie-based via `~/lib/session`. Use `getCurrentUserId(request)` in loaders/actions — returns `number | null`. Redirect to `/login` if null.

## UI / Components

- Shadcn components: `app/components/ui/`. Custom components: `app/components/`. No deeper nesting.
- Combine Tailwind classes with `cn()` from `~/lib/utils` (clsx + tailwind-merge).

## Tests

- Framework: vitest with globals.
- Every test file must mock the db module **before** importing the service under test:
  ```ts
  let testDb: ReturnType<typeof createTestDb>;

  vi.mock("~/db", () => ({
    get db() {
      return testDb;
    },
  }));
  ```
- Use `createTestDb()` and `seedBaseData()` from `~/test/setup` in `beforeEach`.
