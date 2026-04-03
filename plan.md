# Dependency security update plan

## Problem

Keep this monorepo as up to date as practical to reduce dependency-related security exposure, while acknowledging that some parts of the stack (especially Electron and native modules) are harder to upgrade safely than ordinary library dependencies.

## Current state

- The repo is an npm workspace monorepo with these relevant manifests:
  - `package.json`
  - `packages/insomnia/package.json`
  - `packages/insomnia-send-request/package.json`
  - `packages/insomnia-smoke-test/package.json`
  - `packages/insomnia-testing/package.json`
  - `packages/insomnia/send-request/electron/package.json` is only a tiny shim.
- Most of the dependency surface lives in `packages/insomnia` (57 dependencies, 94 devDependencies).
- `packages/insomnia-send-request` adds 28 dependencies.
- `packages/insomnia-smoke-test` adds 4 dependencies and 25 devDependencies.
- `packages/insomnia-testing` currently has no direct dependency surface of its own.
- Runtime and toolchain pins are currently spread across:
  - `.nvmrc` -> Node `18.18.2`
  - `.npmrc` -> Electron runtime target `25.2.0`
  - `shell.nix` -> `nodejs-18_x` and `electron_25`
- `npm audit` baseline at plan time:
  - 108 total vulnerabilities
  - 13 critical
  - 63 high
  - 19 moderate
  - 13 low

## Highest-priority findings

### 1. Critical direct dependencies

- `@stoplight/spectral-core` with related `@stoplight/spectral-formats` and `@stoplight/spectral-rulesets`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit indicates major-version remediation and transitive issues through `jsonpath-plus`, `minimatch`, and `nimma`
- `httpsnippet`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit suggests moving to `3.0.10` as a major upgrade
- `jsonpath-plus`
  - Declared directly in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit suggests moving to `10.4.0`
- `nedb`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - No automatic fix is available
  - `DEVELOPMENT.md` already documents NeDB as unmaintained, so this is a structural risk rather than a simple version lag

### 2. High direct dependencies with straightforward remediation paths

- Root: `@xmldom/xmldom`
- App/send-request: `axios`, `dompurify`, `node-forge`
- Smoke tests: `express`
- App/tooling: `vite`, `electron-builder`, `electron-builder-squirrel-windows`
- Related direct packages with audit pressure that should be checked during update waves: `ws`, `svgo`, `mocha`, `react-router-dom`
- `packages/insomnia/package.json` also pins `protobufjs` in `overrides`, which should be reevaluated after direct dependency upgrades

### 3. High-risk platform/toolchain area

- `electron` is pinned at `25.8.1` in `packages/insomnia/package.json`
- Audit recommends a much newer major Electron line
- Electron upgrade work is coupled to:
  - `.npmrc`
  - `.nvmrc`
  - `shell.nix`
  - packaging/build behavior
  - native module compatibility for `@getinsomnia/node-libcurl`
- `@electron-forge/cli` also shows audit pressure with no automatic fix path, so the build chain needs to be treated as a coordinated upgrade rather than a piecemeal bump

### 4. Special investigation items

- `@getinsomnia/node-libcurl` has a high-severity finding and is tightly coupled to Electron / Node ABI compatibility
- `apiconnect-wsdl` appears to pull vulnerable XML-related dependencies; the audit fix suggestion is not obviously safe and needs manual review
- `grpc-reflection-js` in the smoke test workspace has no automatic audit fix

## Proposed approach

1. Prioritize direct dependencies first, because they give the highest security payoff with the clearest ownership.
2. Separate work into update waves so the hardest parts do not block easier fixes:
   - fast direct upgrades
   - major library upgrades
   - Electron/native-module toolchain upgrades
   - no-fix replacement or mitigation work
3. Re-run install/audit/lint/type-check/test/smoke validation after each wave rather than attempting one repo-wide mega-upgrade.
4. Keep replacements and mitigations visible in the same backlog, since version bumps alone will not eliminate the most serious long-term risks.

## Todo backlog

1. `root-and-common-security-bumps`
   - Update root `@xmldom/xmldom` and other direct packages with clear security fixes and low migration risk.
   - Refresh lockfile state and reduce the easy audit findings first.
2. `http-parser-and-sanitizer-updates`
   - Update `axios`, `dompurify`, `node-forge`, and adjacent direct app/send-request dependencies.
   - Verify request sending, auth flows, and HTML rendering paths.
3. `spectral-stack-major-upgrade`
   - Upgrade `@stoplight/spectral-core`, `@stoplight/spectral-formats`, `@stoplight/spectral-rulesets`, and `jsonpath-plus`.
   - Validate ruleset loading, linting behavior, and bundling.
4. `httpsnippet-major-upgrade`
   - Move `httpsnippet` to a current safe major in both app packages.
   - Validate generated request snippets and any export/copy workflows that depend on it.
5. `electron-toolchain-upgrade`
   - Upgrade `electron`, `electron-builder`, and Windows packaging helpers.
   - Align `.npmrc`, `.nvmrc`, `shell.nix`, and related build assumptions.
6. `node-libcurl-compatibility`
   - Upgrade `@getinsomnia/node-libcurl` alongside the chosen Electron/Node versions.
   - Verify native build, development startup, and packaging behavior.
7. `smoke-test-security-upgrades`
   - Update `express`, `oidc-provider`, `ws`, and related smoke-test dependencies.
   - Rework or replace packages that cannot be updated cleanly.
8. `legacy-no-fix-remediation`
   - Plan and execute remediation for `nedb` and other no-fix audit findings.
   - Investigate `apiconnect-wsdl` and other XML-chain risks before choosing update, replacement, or mitigation paths.
9. `transitive-overrides-and-reaudit`
   - Revisit `overrides` such as `protobufjs`.
   - Add targeted overrides only where direct upgrades are insufficient, then re-audit to measure residual risk.

## Notes

- Confirmed scope: this plan covers runtime, build, and test dependencies, because build-chain issues still affect the repo's security posture and ability to ship safely.
- Confirmed scope: this backlog explicitly includes replacement or mitigation work for no-fix dependencies such as `nedb` and other packages that cannot be remediated by a simple version bump.
