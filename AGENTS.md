# Repository Guide

## Overview

Insomnium is a privacy-focused, fully local API client desktop app built with Electron and React. This repository is an `npm` workspaces monorepo. Most product code lives in `packages/insomnia`.

The root `README.md` notes that the project is currently not being actively maintained, so some scripts and docs are slightly stale.

## Workspace map

| Path | Purpose | Notes |
| --- | --- | --- |
| `packages/insomnia` | Main Electron desktop app | Entry point for almost all product work |
| `packages/insomnia-testing` | Shared test generator/runtime package | Helpers for generating and running test suites |
| `packages/insomnia-smoke-test` | Playwright smoke and CLI test package | Contains app smoke tests, fixtures, and debug docs |
| `packages/insomnia-send-request` | Thin workspace package | In this checkout it only contains `package.json`; request-send code also exists under `packages/insomnia/send-request` |

## Main app layout

Inside `packages/insomnia`, the high-value directories are:

| Path | What it contains |
| --- | --- |
| `src/main` | Electron main-process code, IPC wiring, window and local storage helpers |
| `src/ui` | React renderer app: components, containers, hooks, routes, styling |
| `src/common` | Shared utilities such as database helpers, import/export, settings, rendering helpers |
| `src/models` | Application data models for requests, responses, workspaces, environments, gRPC, WebSocket, and test entities |
| `src/network` | Request sending, authentication flows, certificates, gRPC, cookie handling |
| `src/plugins` | Plugin installation and plugin-facing logic |
| `src/templating` | Nunjucks-based templating support |
| `src/sync` | Sync and version-control related code |
| `preload.ts` / `renderer.ts` | Electron preload and renderer entry points |

When choosing where to start:

- UI and route work usually starts in `packages/insomnia/src/ui`.
- Electron integration and native behavior usually starts in `packages/insomnia/src/main`.
- Request/auth/certificate/gRPC changes usually start in `packages/insomnia/src/network`.
- Data shape and persistence work usually starts in `packages/insomnia/src/models` and `packages/insomnia/src/common`.

## Common commands

Run these from the repository root unless a package-specific workflow says otherwise:

- `npm i`
- `npm run dev`
- `npm run lint`
- `npm run type-check`
- `npm test`
- `npm run app-build`
- `npm run app-package`
- `npm run test:smoke:dev`
- `npm run lint:markdown`

The root `lint`, `type-check`, and `test` scripts fan out to workspaces with `--workspaces --if-present`.

## Testing conventions

- Unit tests are written with Jest.
- In `packages/insomnia`, tests are usually colocated with code or stored in nearby `__tests__` directories.
- `packages/insomnia` uses a `jsdom` Jest environment and the shared root preset in `jest-preset.js`.
- Browser-style smoke tests live in `packages/insomnia-smoke-test` and use Playwright.
- For local smoke-test development, `packages/insomnia-smoke-test/README.md` documents the `watch:app` plus `test:smoke:dev` workflow.

## Useful docs

- `README.md`: project purpose, setup, root commands
- `DEVELOPMENT.md`: architecture overview and testing model
- `CONTRIBUTING.md`: issue and PR expectations
- `packages/insomnia-smoke-test/README.md`: smoke-test development and debugging
- `packages/insomnia-smoke-test/CLI.md`: CLI smoke-test notes
- `plan.md`: keep this root backlog document current whenever plan-backed work changes status, clears a blocker, or finishes

## Planning discipline

- If a task is executing against the root `plan.md`, update `plan.md` as the work progresses rather than only at the end.
- When a blocker is cleared or a backlog item moves to done, reflect that in `plan.md` before concluding the task.

## Known quirks

- Root scripts and some docs still reference `packages/insomnia-inso`, but that workspace is not present in the current repository tree.
- `packages/insomnia-send-request` is minimal in this checkout, so request-sending behavior is easier to trace from `packages/insomnia/src/network` and `packages/insomnia/send-request`.
