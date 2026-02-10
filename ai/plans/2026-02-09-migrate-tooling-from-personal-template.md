# Migrate Tooling from Personal App Template

Bring learn-chinese in line with `personal-app-template-sqlite-fly-io` tooling: biome, vitest, playwright, lefthook, commitlint, fly.io, CI, skills, and CLAUDE.md. No code refactoring — config only, stub tests.

---

## 1. Switch from npm to pnpm

Delete `package-lock.json`, create `.npmrc` with `shamefully-hoist=true`, install with pnpm.

```bash
rm package-lock.json
echo "shamefully-hoist=true" > .npmrc
pnpm install
```

Add to `package.json`:

```json
"packageManager": "pnpm@10.28.2"
```

---

## 2. Install dev dependencies

```bash
pnpm add -D @biomejs/biome @commitlint/cli @commitlint/config-conventional lefthook vitest @playwright/test happy-dom @testing-library/react @faker-js/faker
```

---

## 3. Add `biome.json`

Copy from template verbatim:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.14/schema.json",
  "assist": {
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": [":NODE:", ":PACKAGE:", ":BLANK_LINE:", ":PATH:"]
          }
        },
        "useSortedAttributes": "on",
        "useSortedKeys": "on"
      }
    },
    "enabled": true
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**", "!.react-router"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "correctness": {
        "noReactPropAssignments": "error",
        "useHookAtTopLevel": "error",
        "useJsonImportAttributes": "error",
        "useJsxKeyInIterable": "error",
        "useSingleJsDocAsterisk": "error"
      },
      "recommended": true,
      "style": {
        "useForOf": "error",
        "useImportType": {
          "level": "error",
          "options": { "style": "separatedType" }
        },
        "useNumberNamespace": "error",
        "useNumericSeparators": "error",
        "useSelfClosingElements": "error",
        "useTrimStartEnd": "error"
      },
      "suspicious": {
        "noDuplicateTestHooks": "error",
        "noFocusedTests": "error",
        "noGlobalIsFinite": "off",
        "noGlobalIsNan": "error",
        "noMisplacedAssertion": "error",
        "noUnknownAtRules": "off"
      }
    }
  },
  "vcs": {
    "clientKind": "git",
    "defaultBranch": "main",
    "enabled": true,
    "useIgnoreFile": true
  }
}
```

---

## 4. Add `commitlint.config.mjs`

```js
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
  },
};
```

---

## 5. Add `lefthook.yml` and prepare script

Create `lefthook.yml`:

```yaml
pre-commit:
  commands:
    biome-check:
      glob: "*.{js,jsx,ts,tsx,json,css}"
      run: pnpm biome check --write --staged {staged_files}
      stage_fixed: true
    typecheck:
      run: pnpm typecheck

commit-msg:
  commands:
    commitlint:
      run: pnpm commitlint --edit {1}
```

Add `"prepare": "lefthook install"` to `package.json` scripts, then run `pnpm run prepare`.

---

## 6. Update `vite.config.ts` with vitest

Keep existing `__BUILD_HASH__` define, add vitest config. Change import from `vite` to `vitest/config`:

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import devtoolsJson from "vite-plugin-devtools-json";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [
    tailwindcss(),
    !process.env.VITEST && reactRouter(),
    tsconfigPaths(),
    devtoolsJson(),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          include: ["app/**/*.test.ts"],
          name: "unit-tests",
        },
      },
      {
        extends: true,
        test: {
          environment: "happy-dom",
          include: ["app/**/*.test.tsx"],
          name: "react-happy-dom-tests",
        },
      },
    ],
  },
});
```

Note: no integration-tests project (no Prisma in this project).

---

## 7. Add `playwright.config.ts`

Adapted from template (uses npm scripts since learn-chinese uses `react-router-serve`):

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: "html",
  retries: process.env.CI ? 2 : 0,
  testDir: "./playwright",
  testMatch: "*.e2e.ts",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:5173",
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
  },
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    env: { NODE_ENV: "test" },
    port: process.env.CI ? 3000 : 5173,
    reuseExistingServer: !process.env.CI,
  },
  workers: 1,
});
```

---

## 8. Add stub test files

Create `app/test/example.test.ts`:

```ts
import { describe, expect, test } from "vitest";

describe("example", () => {
  test("given: vitest is configured, should: pass", () => {
    expect(true).toEqual(true);
  });
});
```

Create `playwright/example.e2e.ts`:

```ts
import { expect, test } from "@playwright/test";

test("given: app is running, should: load homepage", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
});
```

---

## 9. Add package.json scripts

Add these scripts to `package.json`:

```json
"check": "biome check --write .",
"lint": "biome ci --css-parse-tailwind-directives=true .",
"prepare": "lefthook install",
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

---

## 10. Add `fly.toml`

Note: this covers the Node app only. The Python companion server would need a separate Fly app or be consolidated into a multi-process setup.

```toml
app = "learn-chinese"
primary_region = "iad"
swap_size_mb = 512

[env]
  NODE_ENV = "production"

[mounts]
  source = "data"
  destination = "/data"

[[http_service.checks]]
  grace_period = "10s"
  interval = "15s"
  method = "GET"
  path = "/"
  timeout = "5s"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    soft_limit = 80
    hard_limit = 100
```

---

## 11. Update Dockerfile for pnpm + Fly.io

Replace existing Dockerfile:

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS development-dependencies-env
COPY package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies-env
COPY package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod

FROM base AS build-env
COPY package.json pnpm-lock.yaml tsconfig.json react-router.config.ts vite.config.ts /app/
COPY app/ /app/app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm build

FROM base
COPY package.json pnpm-lock.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["pnpm", "start"]
```

---

## 12. Add `.github/workflows/ci.yml`

Adapted from template — no Prisma steps, uses npm-compatible commands:

```yaml
name: Pull Request

on:
  push:
    branches: [main, dev]
  pull_request: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  lint:
    name: Biome
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  type-check:
    name: TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  commitlint:
    name: commitlint
    runs-on: ubuntu-latest
    if: github.actor != 'dependabot[bot]'
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: wagoid/commitlint-github-action@v6

  vitest:
    name: Vitest
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  playwright-chrome:
    name: Playwright Chrome
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm build
      - run: npx playwright test --project=chromium
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## 13. Add `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["Pull Request"]
    types: [completed]
    branches: [main]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@1.5
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

---

## 14. Update `.gitignore`

Append these entries:

```
# Testing
/coverage/
/playwright-report/
/test-results/

# pnpm
pnpm-lock.yaml is tracked, but:
# (no changes needed, just documenting)
```

---

## 15. Install aidd-skills

```bash
cd /Users/iulspop/Development/Personal/learn-chinese
npx skills add iulspop/aidd-skills --yes --agent claude-code
```

---

## 16. Update CLAUDE.md

Append skills install instructions and update commands section to include new scripts. Keep all existing content, add at the top:

```markdown
## Skills

Install all shared skills:
```
npx skills add --yes --agent claude-code iulspop/aidd-skills
```

Install a single skill:
```
npx skills add --yes --agent claude-code iulspop/aidd-skills/skills/<skill-name>
```
```

Add to Commands section:

```markdown
- `pnpm check` — biome lint + format (auto-fix)
- `pnpm lint` — biome CI check (no auto-fix)
- `pnpm test` — run vitest
- `pnpm test:watch` — vitest in watch mode
- `pnpm test:e2e` — run playwright
```
