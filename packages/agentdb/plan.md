# NeDB replacement plan

## Problem
Replace the external `nedb` dependency with an in-repo minimal implementation that supports only the behaviors Insomnium actually uses, while keeping the app-facing `database` API stable.

## Current state
- `packages/insomnia/src/common/database.ts` is the only module that imports `nedb`; the rest of the app talks to the exported `database` wrapper.
- `database.ts` owns collection init per model type, the `insomnia.{modelType}.db` file-path contract, in-memory mode for tests, file-backed mode for the app, CRUD wrappers, cursor queries, IPC forwarding, change buffering, recursive ancestor/descendant traversal, model hooks, and startup repair via `_fixDBShape()`.
- The used NeDB surface is limited to:
  - constructor options: `autoload`, `filename`, `corruptAlertThreshold`, plus `inMemoryOnly` via config overrides
  - `persistence.setAutocompactionInterval()`
  - `count(query, cb)`
  - `find(query).sort(sort).limit(limit).exec(cb)`
  - `insert(doc, cb)`
  - `update(query, doc, cb)`
  - `remove(query, { multi: true }?)`
- Query behavior observed in call sites is equality on `_id`, `parentId`, `remoteId`, `plugin`, `key`, `environmentId`, and `protoFileId`, plus `$gt`, `$in`, and `$nin`.
- Contract details worth preserving:
  - `findMostRecentlyModified()` currently swallows query errors and returns `[]`
  - `remove()` and `removeWhere()` kick off underlying deletes without awaiting them, then notify and flush buffered changes
  - model lifecycle hooks (`hookDatabaseInit`, `hookRemove`, and any future hook insert/update usage) are part of the database lifecycle
  - `database.init()` must remain idempotent
  - the git sync layer (`src/sync/git/ne-db-client.ts`) relies on the higher-level database wrapper rather than raw NeDB
- `packages/insomnia-send-request/package.json` still declares `nedb`, but repository search did not find runtime imports there.

## Proposed approach
Implement a separate workspace package at `packages/agentdb` that provides a small NeDB-compatibility layer. Keep `packages/insomnia/src/common/database.ts` as the Insomnia-specific adapter, preserve read/write compatibility with existing `insomnia.*.db` files, and scope `agentdb` to the query, cursor, persistence, and lifecycle behaviors the repository actually exercises.

## Todos
1. Capture the compatibility contract in tests around `database.ts`, `_fixDBShape()`, and `NeDBClient`.
2. Design persistence around existing NeDB file compatibility so current `insomnia.*.db` data keeps working in place.
3. Create the `agentdb` package boundary and implement an internal collection and cursor layer for the used query and CRUD surface.
4. Implement persistence, autoload, and compaction behavior inside `agentdb` for in-memory and file-backed modes.
5. Swap `packages/insomnia/src/common/database.ts` off `nedb` onto `agentdb` without changing higher-level callers.
6. Remove dead package dependencies and type packages, then update manifests and lockfiles.
7. Run repository validation with `npm run lint`, `npm run type-check`, and `npm test`.

## Notes and risks
- Compatibility requirement confirmed: the replacement should keep reading and writing existing `insomnia.*.db` files in place, so persistence and file-format parity are a first-class part of the work.
- Preserve the `insomnia.{modelType}.db` filename contract unless the work includes an explicit migration path; `agentdb` should honor the same path and file naming contract.
- Keep the boundary clean: `agentdb` should own generic storage behavior, while Insomnia-specific IPC, change buffering orchestration, model hooks, repairs, and descendant traversal can stay in `packages/insomnia` unless later refactoring clearly pays off.
- Do not re-implement unused NeDB features such as indexes, rich Mongo query operators, update modifiers, or live queries unless later investigation proves a real caller needs them.
- No direct caller was found passing custom sort clauses or string queries into `database.find()`, so the implementation can prioritize the current query subset while keeping the wrapper signature stable.
- Regression coverage should focus on change buffering, cascading deletes, startup repairs, response cleanup hooks, and git sync expectations before the dependency swap happens.

## Likely files
- `packages/agentdb/plan.md`
- `packages/agentdb/package.json`
- `packages/agentdb/src/`
- `packages/insomnia/src/common/database.ts`
- `packages/insomnia/src/common/__tests__/database.test.ts`
- `packages/insomnia/src/sync/git/ne-db-client.ts`
- `packages/insomnia/src/sync/git/__tests__/ne-db-client.test.ts`
- `packages/insomnia/package.json`
- `packages/insomnia-send-request/package.json`
- `package-lock.json`
