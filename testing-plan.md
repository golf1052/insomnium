# Testing plan for dependency update work

## Goal

Support the dependency-security work in `plan.md` with enough automated coverage that dependency changes can be validated confidently, then ratchet broader coverage gates upward so the repo keeps that safety margin.

## Current baseline

- Root `npm test` fans out across workspace test scripts from `package.json`.
- `packages/insomnia` is the main validation surface.
  - Current baseline command:
    - `npm test --workspace=packages/insomnia -- --coverage --coverageReporters=text-summary --runInBand`
  - Current baseline result:
    - Statements: `64.72%` (`5735/8860`)
    - Branches: `50.56%` (`2197/4345`)
    - Functions: `54.81%` (`917/1673`)
    - Lines: `64.56%` (`5420/8394`)
  - Current Jest coverage behavior:
    - coverage is enabled in CI
    - `collectCoverageFrom` currently covers `src/account`, `src/common`, `src/main`, `src/models`, `src/network`, `src/sync`, `src/templating`, and `src/utils`
    - `src/ui` is not currently part of coverage collection
    - the only configured threshold is a global `35%` line minimum
- `packages/agentdb` has a small but useful direct baseline.
  - Current baseline command:
    - `npm test --workspace=packages/agentdb -- --coverage --coverageReporters=text-summary --runInBand`
  - Current baseline result:
    - Statements: `62.47%` (`293/469`)
    - Branches: `47.2%` (`152/322`)
    - Functions: `78.3%` (`83/106`)
    - Lines: `62.61%` (`283/452`)
  - No coverage threshold is configured.
- `packages/insomnia-testing` has Jest tests, but no coverage instrumentation or threshold.
- `packages/insomnia-smoke-test` provides Playwright smoke, prerelease, critical, and CLI coverage for end-to-end flows such as OpenAPI, GraphQL, WebSocket, gRPC, OAuth, and backup/restore, but it does not currently produce code coverage metrics.
- `packages/insomnia-send-request` has no direct tests in this checkout.

## Where current coverage is strongest

- Request/network plumbing:
  - `packages/insomnia/src/main/network/__tests__/axios-request.test.ts`
  - `packages/insomnia/src/network/__tests__/network.test.ts`
  - `packages/insomnia/src/network/__tests__/authentication.test.ts`
- Data/storage and sync:
  - `packages/insomnia/src/common/__tests__/database.test.ts`
  - `packages/insomnia/src/sync/git/__tests__/ne-db-client.test.ts`
  - `packages/agentdb/src/index.test.ts`
- End-to-end protocol coverage:
  - `packages/insomnia-smoke-test/tests/smoke/openapi.test.ts`
  - `packages/insomnia-smoke-test/tests/smoke/graphql.test.ts`
  - `packages/insomnia-smoke-test/tests/smoke/websocket.test.ts`

## Main gaps to close before dependency changes

1. `packages/insomnia-send-request` has no direct tests.
1. `httpsnippet`, JSONPath, and markdown sanitization are integrated in files that do not currently have direct tests:
   - `packages/insomnia/src/ui/components/modals/generate-code-modal.tsx`
   - `packages/insomnia/src/ui/components/dropdowns/request-actions-dropdown.tsx`
   - `packages/insomnia/src/common/markdown-to-html.ts`
   - `packages/insomnia/src/ui/components/templating/local-template-tags.ts`
   - `packages/insomnia/src/ui/components/modals/request-render-error-modal.tsx`
1. Spectral/OpenAPI wiring in `packages/insomnia/src/main/ipc/main.ts` is primarily covered by smoke tests rather than direct unit or integration tests.
1. WSDL/XML importer behavior is covered by larger fixture tests, but `apiconnect-wsdl` behavior is not isolated by focused guardrail tests.
1. Smoke-test server helpers are mainly validated indirectly through Playwright, not direct tests.
1. Broader coverage gates are too loose for the work ahead: `packages/insomnia` only enforces a low line threshold, while `agentdb` and `insomnia-testing` have no thresholds at all.

## Validation matrix

| Update wave | Main deps | Main code paths | Current coverage | Required additions | Validation commands |
| --- | --- | --- | --- | --- | --- |
| Core request/auth/network | `axios`, `node-forge`, `@getinsomnia/node-libcurl`, `lodash` | `packages/insomnia/src/main/network/`, `packages/insomnia/src/network/` | Good direct Jest coverage already exists | Add any missing edge-case tests discovered during upgrades | `npm test --workspace=packages/insomnia -- --runInBand src/main/network/__tests__/axios-request.test.ts src/network/__tests__/authentication.test.ts src/network/__tests__/network.test.ts` |
| Code generation, JSONPath, sanitization | `httpsnippet`, `jsonpath-plus`, `dompurify` | `generate-code-modal.tsx`, `request-actions-dropdown.tsx`, `markdown-to-html.ts`, `local-template-tags.ts`, `request-render-error-modal.tsx` | No direct tests found | Add focused unit/component tests before upgrading these deps | `npm test --workspace=packages/insomnia -- --runInBand` plus the new targeted Jest files |
| OpenAPI linting and Spectral | `@stoplight/spectral-core`, `@stoplight/spectral-formats`, `@stoplight/spectral-rulesets` | `packages/insomnia/src/main/ipc/main.ts` | Smoke coverage exists via `tests/smoke/openapi.test.ts` | Add direct tests for ruleset loading, fallback behavior, and diagnostics | `npm test --workspace=packages/insomnia -- --runInBand` plus `npm run test:dev --workspace=packages/insomnia-smoke-test -- tests/smoke/openapi.test.ts` |
| Importers and WSDL/XML | `apiconnect-wsdl`, `js-yaml`, XML-related libs | `packages/insomnia/src/utils/importers/` | Broad fixture coverage exists | Add focused importer tests around WSDL/XML failure and fallback paths | `npm test --workspace=packages/insomnia -- --runInBand src/utils/importers/importers/index.test.ts` |
| Smoke protocol servers | `express`, `graphql`, `ws` | `packages/insomnia-smoke-test/server/`, smoke tests | Flow coverage exists through Playwright | Add direct tests for server helpers where behavior is protocol-sensitive | `npm run test:dev --workspace=packages/insomnia-smoke-test -- tests/smoke/graphql.test.ts tests/smoke/websocket.test.ts` |
| Data layer and persistence | `agentdb` and related storage paths | `packages/agentdb/src/`, `packages/insomnia/src/common/database.ts`, `packages/insomnia/src/sync/git/` | Good direct coverage, but limited thresholds | Keep expanding edge-case tests and add stronger thresholds | `npm test --workspace=packages/agentdb -- --coverage --coverageReporters=text-summary --runInBand` and `npm test --workspace=packages/insomnia -- --runInBand src/common/__tests__/database.test.ts src/sync/git/__tests__/ne-db-client.test.ts` |

## Test work plan

1. Record and preserve the current baseline coverage commands and results for `packages/insomnia` and `packages/agentdb`.
1. Add a direct test surface for `packages/insomnia-send-request`.
1. Add targeted tests for UI code generation, JSONPath, and markdown sanitization flows before touching `httpsnippet`, `jsonpath-plus`, and `dompurify`.
1. Add direct Spectral guardrail tests in `packages/insomnia/src/main/ipc/main.ts`.
1. Strengthen importer coverage around WSDL/XML paths before changing `apiconnect-wsdl`.
1. Add direct tests for smoke-test support code where protocol behavior matters.
1. After the missing tests are in place, expand coverage collection and raise broader coverage thresholds across the repo.

## Coverage ratchet plan

1. Keep the current measured baselines as the floor.
1. Add direct tests to the highest-risk dependency-touching surfaces first.
1. Expand `packages/insomnia` coverage collection into the `src/ui` files that now have direct tests.
1. Add or raise thresholds for `packages/insomnia`, `packages/agentdb`, and `packages/insomnia-testing` in stable steps rather than one large jump.
1. Re-run the targeted unit/integration matrix and the relevant smoke coverage after each dependency-update wave.

## Definition of ready for dependency work

Dependency upgrade work should start only after all of the following are true:

1. Baseline coverage commands are documented and reproducible.
1. `packages/insomnia-send-request` has its first direct tests.
1. Direct tests exist for the UI snippet/sanitization paths that currently have none.
1. Spectral/OpenAPI behavior is covered by direct tests in addition to smoke coverage.
1. WSDL/XML importer regressions can be caught by focused tests.
1. Broader coverage gates have been raised to reflect the new test surface rather than the old minimums.
