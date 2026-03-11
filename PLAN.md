Summary: Remove the hybrid sandbox as a supported/runtime type everywhere, leaving only `vercel` and `just-bash`. Since legacy hybrid sessions are known not to contain local file-backed state, use a simple cleanup migration that rewrites old hybrid records directly to `vercel`, with only a minimal runtime safety net.

Context: Key findings from exploration -- existing patterns, relevant files, constraints
- Hybrid is implemented entirely in `packages/sandbox/hybrid/*` and wired into the public sandbox API through `packages/sandbox/factory.ts`, `packages/sandbox/index.ts`, `packages/sandbox/interface.ts`, and `packages/sandbox/types.ts`.
- The web app still exposes hybrid as a first-class choice in API request unions, UI selectors, settings, and client defaults. The highest-impact runtime branches are in `apps/web/app/api/sandbox/route.ts`, `apps/web/app/api/sandbox/reconnect/route.ts`, `apps/web/app/api/chat/route.ts`, `apps/web/lib/sandbox/utils.ts`, and `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-context.tsx`.
- Existing persisted session state in `sessions.sandbox_state` may still reference `type: "hybrid"`, but per the clarified assumption these legacy rows do not contain local file-backed state that needs preservation.
- Snapshot restore currently trusts `sessionRecord.sandboxState.type`, so stale hybrid rows still need a lightweight cleanup/normalization step before or during removal.
- User preferences can also still contain `defaultSandboxType = "hybrid"` even though the DB default was already changed to `vercel` in `apps/web/lib/db/migrations/0014_tough_rafael_vega.sql`.
- Repo conventions require generating a migration after changing `apps/web/lib/db/schema.ts`, and verification should run through Bun scripts (`bun run typecheck`, `bun run ci`, etc.).

Approach: High-level design decision and why
- Remove hybrid from the active product surface and from `@open-harness/sandbox` entirely.
- Add one small cleanup migration for legacy hybrid rows: rewrite legacy hybrid session state and preferences directly to `vercel`.
- Keep one narrow compatibility layer in the web app that translates any leftover persisted hybrid state to `vercel` before the rest of the app touches it. This protects preview/local DBs and any stragglers the migration misses.
- Simplify the web app to a two-sandbox model:
  - `vercel` for full cloud sandboxes and snapshot restore
  - `just-bash` for in-memory sandboxes
- Remove hybrid-specific lifecycle/handoff behavior (`after(...)`, background cloud-ready hook, `cloud-ready` lifecycle reason, handoff-preservation logic in chat persistence).

Changes:
- `packages/sandbox/factory.ts` - remove hybrid imports, `HybridConnectOptions`, the hybrid arm of `SandboxState`, and hybrid dispatch from `connectSandbox()`.
- `packages/sandbox/index.ts` - stop exporting hybrid types/classes and remove `PendingOperation` export if it becomes unused.
- `packages/sandbox/interface.ts` - remove `"hybrid"` from `SandboxType` and update the interface docs to describe only local/in-memory/cloud abstractions.
- `packages/sandbox/types.ts` - remove `PendingOperation` once hybrid is deleted.
- `packages/sandbox/hybrid/connect.ts` - delete.
- `packages/sandbox/hybrid/hooks.ts` - delete.
- `packages/sandbox/hybrid/index.ts` - delete.
- `packages/sandbox/hybrid/sandbox.ts` - delete.
- `packages/sandbox/hybrid/sandbox.test.ts` - delete.
- `.oxlintrc.json` - remove the hybrid sandbox file from the max-lines override list.
- `packages/sandbox/docs/git-simulation-for-in-memory-sandboxes.md` - remove hybrid-specific file references from current sandbox docs.

- `apps/web/lib/db/schema.ts` - remove `"hybrid"` from the `defaultSandboxType` TypeScript enum list.
- `apps/web/lib/db/migrations/*` - add one small SQL cleanup migration that rewrites legacy hybrid rows:
  - `user_preferences.default_sandbox_type = 'hybrid'` -> `'vercel'`
  - `sessions.sandbox_state.type = 'hybrid'` -> `'vercel'`
- `apps/web/lib/db/sessions.ts` - normalize any leftover persisted hybrid `sandboxState` on read via `getSessionById()` so stale rows never leak into runtime code after the package union loses hybrid.
- `apps/web/lib/db/user-preferences.ts` - stop treating `hybrid` as valid input and normalize old values to `vercel`.

- `apps/web/app/api/sandbox/route.ts` - remove hybrid from request typing/defaults, reconnect existing `sandboxId` values as `vercel`, download tarballs only for `just-bash`, and delete background handoff hooks plus the `after` import.
- `apps/web/app/api/sandbox/reconnect/route.ts` - remove the hybrid-specific reconnect branch and operate only on normalized `vercel` / `just-bash` states.
- `apps/web/app/api/chat/route.ts` - remove the hybrid-specific sandbox-state persistence merge and persist `sandbox.getState()` directly.
- `apps/web/lib/sandbox/utils.ts` - remove hybrid branches from `canOperateOnSandbox()`, `hasRuntimeSandboxState()`, internal runtime checks, and `clearSandboxState()`.
- `apps/web/lib/sandbox/lifecycle.ts` - remove the `cloud-ready` lifecycle reason.
- `apps/web/SANDBOX-LIFECYCLE.md` - remove the hybrid handoff event/docs from lifecycle documentation.

- `apps/web/app/api/sessions/route.ts` - remove hybrid from the create-session request union and default to `vercel` when no sandbox type is passed.
- `apps/web/app/api/settings/preferences/route.ts` - remove hybrid from validation.
- `apps/web/hooks/use-sessions.ts` - remove hybrid from the client-side session creation type.
- `apps/web/components/sandbox-selector-compact.tsx` - remove the Hybrid option and narrow `SandboxType` to `"vercel" | "just-bash"`.
- `apps/web/app/settings/preferences-section.tsx` - remove the Hybrid preferences option.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-context.tsx` - remove hybrid from known types/defaults and simplify runtime sandbox detection to `vercel` and `just-bash` only.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/session-chat-content.tsx` - change the fallback sandbox type passed to `/api/sandbox` from `hybrid` to `vercel`.

- `apps/web/app/api/sandbox/route.test.ts` - update mocked state unions and expectations so reconnect/create tests exercise only `vercel` and `just-bash`.
- `apps/web/lib/db/user-preferences.test.ts` - update sandbox-type expectations and add coverage for legacy hybrid normalization to `vercel`.
- `apps/web/app/api/settings/model-variants/route.test.ts` - remove hybrid from mocked preference unions.
- Add/adjust one test around legacy session-state normalization so leftover hybrid state maps directly to `vercel`.

- `docs/agents/lessons-learned.md` - remove or rewrite hybrid-specific lessons that describe current behavior.
- Historical plan docs under `docs/plans/completed/*hybrid*` can be left as archive or deleted in a separate history-scrub pass; they are not required for functional removal.

Verification:
- Generate the schema migration after editing `apps/web/lib/db/schema.ts`:
  - `bun run --cwd apps/web db:generate`
- Review/adjust the generated migration so it includes the small hybrid cleanup update statements above (`hybrid` -> `vercel`).
- Run targeted tests for the touched areas:
  - `bun test apps/web/app/api/sandbox/route.test.ts`
  - `bun test apps/web/lib/db/user-preferences.test.ts`
- Run repo-wide verification:
  - `bun run typecheck`
  - `bun run ci`
- Manual smoke checks:
  - Create a new `vercel` session and confirm create -> reconnect -> snapshot restore still works.
  - Create a new `just-bash` session (empty and repo-backed) and confirm create -> reconnect still works.
  - If you can locate any old hybrid session, verify it now reconnects/restores as `vercel`; otherwise treat the runtime normalization as a safety net, not a migration project.
