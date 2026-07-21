# AutoMATE

A SaaS platform (originally "FlowForge" per `PRD_FlowForge_7.pdf`, then renamed to
"FormAutomator", then to its current name "AutoMATE") that lets a user record a browser
workflow once via a Chrome extension and replay it as a reusable,
parameterized REST API. Includes a marketplace where users sell/buy runnable copies of each
other's automations, and a subscription/quota system gating how many automations can be created
per day.

## PRD (from `PRD_FlowForge_7.pdf`) vs. what's actually built

Core loop from the PRD, fully implemented: **record → review/parameterize → create automation →
call it as a REST API → (optionally) list it on the marketplace**.

Subscription tiers, implemented as mock billing only (see Non-negotiable constraints below):
- **Free** — 5 automation-creation attempts/day.
- **Builder** — 1,500 BDT/month — 30 creation attempts/day, unlimited runs, priority support (label only, no backend behavior).
- **Pro** — 3,500 BDT/month — unlimited creation attempts, unlimited runs, marketplace seller fee discount (actually enforced), early access (label only).
- **Enterprise** — custom pricing, "Contact us" only, not self-serve.

Marketplace, implemented as: mock purchases (no real money) that grant the buyer an independent
runnable copy of the automation, with tiered pricing (single-use / bulk100 / subscription)
enforced at run time via `usesRemaining` / `subscriptionExpiresAt` on the buyer's own copy.

## Non-negotiable constraints (explicit user instructions — do not relax without asking)

- **No real payment/financial processing, ever.** Marketplace purchases and subscription
  "charges" are mock — they instantly succeed and update DB state. Never wire up bKash, cards,
  bank transfer, or any real money movement.
- **Never list email automations on the marketplace.** Doing so would leak the seller's encrypted
  Gmail App Password to the buyer. This is a self-imposed security restriction, disclosed to the
  user, not to be relaxed without a new explicit instruction.
- **No browser-based login automation (e.g., scripted Gmail login).** Sites with real login
  requirements and anti-automation defenses are out of scope for the "record & replay a browser
  workflow" feature. Email sending instead goes through a dedicated SMTP-based "Send Email"
  automation type using a real Gmail App Password (see Email automations below).
- **Playwright must run headless.** A `headless: false` attempt crashed the whole server with
  `spawn UNKNOWN` — this sandboxed environment has no interactive desktop/window-station. User
  explicitly said to revert rather than chase a windowed browser. Keep `headless: true`.

## Repo layout (npm workspaces)

```
apps/server    Express + TypeScript backend (port 4000)
apps/web       React + Vite frontend (port 5173)
apps/extension Chrome Extension Manifest V3 (esbuild-bundled)
packages/shared TypeScript types shared by server + web (+ extension via copy/build)
fixtures/test-site  Static test site for exercising the extension (port 8080 via http-server)
```

Dev servers are defined in `.claude/launch.json` and started via the `preview_start` tool (never
plain Bash) with names: `"server"`, `"web"`, `"fixtures"`. Servers commonly die between sessions —
just restart them and hit `GET /api/health` to confirm.

## Backend (`apps/server/src`)

- **`db.ts`** — SQLite via Node's built-in `node:sqlite` (`DatabaseSync`), *not* `better-sqlite3`
  (native build fails on Windows in this environment with node-gyp `spawn UNKNOWN`). Schema +
  additive migrations. New columns are always added via the `addColumnIfMissing(table, columnDef)`
  helper (tries `ALTER TABLE`, swallows the "column exists" error) — follow this pattern for any
  future schema change, never a destructive migration.
- **`auth.ts`** — JWT auth (`jsonwebtoken` + `bcryptjs`). `requireAuth` re-checks the user still
  exists in the DB (not just JWT signature validity) so a stale token after a DB reset returns a
  clean 401 instead of crashing on a foreign-key violation downstream.
- **`crypto.ts`** — AES-256-GCM encrypt/decrypt for Gmail App Passwords, key persisted in a local
  gitignored `.secret-key` file.
- **`paramDetect.ts`** — turns recorded steps into "changeable" parameter candidates. Scans both
  `input`/`change` step values AND `navigate` step query-string parameters (booking.com and similar
  sites are 100% click-driven with no native form fields, so URL params are the only way to expose
  changeable state for them). URL params are taken only from the LAST navigate step (replay jumps
  to that URL, so params bound to earlier navigates would be silently ignored; history-state capture
  also records one navigate per filter click, which would otherwise duplicate every param). Uses a
  `FRIENDLY_PARAM_LABELS` dictionary to rename cryptic params (e.g. `ss` → something readable) and
  an `INTERNAL_SUFFIXES` filter (`_id`/`_type`/`_code`) that drops noise params like `dest_id`
  entirely rather than just hiding them. Suppresses filter-aggregate params (booking's `nflt`) whose
  tokens match recorded checkbox `nativeValue`s — the checkboxes are that param's UI.
- **`replayEngine.ts`** — Playwright-driven replay. Detects the automation's final `navigate` step
  and jumps straight to its (possibly parameterized) URL instead of replaying every prior click —
  this avoids brittle structural selectors (e.g. calendar-widget cells) breaking when replayed with
  different parameter values. Filter checkboxes (booking's "Popular filters") are applied via
  `applyToggleFilters()`: each checkbox step's `nativeValue` is the site's URL filter token
  (`mealplan=1`), and run-time checked state adds/removes that token in the final URL's ;-joined
  filter param (`nflt`), learned from recorded navigate URLs (fallback: any param shaped like a
  token list). No checkbox is ever clicked on the replayed page — that path was permanently broken
  by booking.com's bot wall (headless sessions get an AWS WAF challenge / simplified city page).
  `browser` is declared `let browser: Browser | undefined` and launched
  inside the try/catch so `catch`/`finally` can safely reference it even if `launch()` itself throws.
- **`planLimits.ts`** — subscription/quota logic. `DAILY_LIMITS` (free=5, builder=30, pro/enterprise=
  null/unlimited), `PLAN_PRICES` (builder=1500, pro=3500 BDT), `getPlanInfo(userId)`, and
  `checkAndConsumeCreationQuota(userId)` (returns `null` + increments on success, else an error
  string). A lapsed paid plan (`plan_renews_at` in the past) reverts to `free` automatically.
- **`routes/auth.ts`** — signup/login.
- **`routes/drafts.ts`** — recording drafts (created by the extension, reviewed on `/review/:draftId`).
- **`routes/automations.ts`** — CRUD + run for browser-workflow automations. Creation is gated by
  `checkAndConsumeCreationQuota` (402 if exceeded). Run is gated by `licenseMode` for
  marketplace-purchased copies (`single`/`bulk100` decrement `usesRemaining`; `subscription` checks
  `subscriptionExpiresAt`). Exports `rowToAutomation()` for reuse by marketplace routes.
- **`routes/emailAutomations.ts`** — SMTP-based "Send Email" automation type (`nodemailer`,
  smtp.gmail.com:587, encrypted App Password). Same quota gate as `automations.ts` on creation.
  Never marketplace-listable.
- **`routes/marketplace.ts`** — list/browse/create/delete listings, mock `purchase` endpoint that
  clones the automation into a new row owned by the buyer. `platformFeeFor(price, sellerPlan)`
  applies a 50% discount to the base rate when the seller is on `pro`/`enterprise`.
- **`routes/me.ts`** — profile info (email, created date, avatar, automation count) spread with
  `getPlanInfo()`.
- **`routes/subscription.ts`** — `GET /` (plan info), `POST /purchase` (mock subscribe; rejects
  `enterprise` with a "contact us" message; sets `plan` + `plan_renews_at` +30 days).
- **`index.ts`** — registers all routers under `/api/*`, global error middleware.

## Frontend (`apps/web/src`)

React Router v6. `Topbar`/`NavLink` in `App.tsx` highlight the active route via `useLocation()`.
Site-wide indigo/violet theme lives in `styles.css` as CSS custom properties (`--primary`,
`--primary-dark`, `--ink`, `--muted`, `--border`, `--bg`, etc.) — reuse these vars, don't hardcode
colors. `api.ts` is the single fetch wrapper (`request<T>`) — it auto-attaches the JWT, and on a
401 with a token present it clears the token and redirects to `/login` (handles stale/deleted-user
tokens gracefully).

Pages:
- **`Home.tsx`** — landing page.
- **`Login.tsx`** — login/signup.
- **`Dashboard.tsx`** — user *profile* page (not the automations list): email, avatar upload,
  automation count, member-since date, and a "Plan" card (badge + usage + link to `/payment`).
- **`MyApis.tsx`** — the actual list of the user's automations (moved here out of Dashboard),
  including delete.
- **`Review.tsx`** — post-recording review/parameterize screen (draft → automation).
- **`AutomationDetail.tsx`** / **`EmailAutomationDetail.tsx`** — single-automation view, run UI, docs.
- **`NewEmailAutomation.tsx`** — create an SMTP "Send Email" automation.
- **`Marketplace.tsx`** / **`NewListing.tsx`** — browse/buy listings, create a listing from an
  owned automation.
- **`Plans.tsx`** — the `/payment` route (nav label says "Plans", path kept as `/payment`). Shows
  all four tiers, current plan + today's usage, mock-subscribe confirm dialogs, "Contact us" for
  enterprise.

`packages/shared/src/index.ts` holds every cross-cutting type: `RecordedStep`, `ParameterDef` (has
`urlParam?`), `ParameterCandidate`, `OutputField`, `LicenseMode` (`"unlimited"|"single"|"bulk100"|
"subscription"`), `Automation`, `RunResult`, `EmailAutomation`, `EmailRunResult`, `PricingMode`,
`MarketplaceListing`, `PurchaseResult`, `SubscriptionPlan`, `PlanInfo`, `SubscribeResult`.

## Extension (`apps/extension/src`)

Manifest V3, bundled with esbuild (`build.js`).

- **`content.ts`** — injected into the target page. Listens for `input` events (not `change`,
  which only fires on blur and misses per-keystroke edits), builds multi-strategy CSS/Playwright
  selectors per field (`selector.ts`), detects human-readable field labels via `<label>`,
  aria-label, or placeholder (`labels.ts`), and renders a shadow-DOM recording toolbar (no "Mark
  output" button anymore — removed per user request in favor of showing all recorded fields as
  inline-editable in the Changeable Details review step). Checkbox/radio steps record checked state
  as `value` ("true"/"false") plus the element's raw value attribute as `nativeValue` — on filter
  checkboxes that attribute is the site's URL filter token (booking: `mealplan=1`), which is what
  lets replay apply filters through the URL.
- **`background.ts`** — service worker; proactively self-injects the content script into
  already-open tabs via `chrome.scripting.executeScript` when recording starts (fixes the earlier
  "0 steps captured" bug, which was content script not being present in tabs opened before the
  extension loaded). Records navigate steps from BOTH `webNavigation.onCommitted` (full page loads)
  and `onHistoryStateUpdated` (pushState/replaceState — how booking reflects each filter click in
  the URL), so the final navigate step carries the fully-filtered URL. Extension changes require
  rebuild (`npm run package-zip -w apps/extension`, also refreshes the downloadable zip in
  `apps/web/public`) AND a manual reload by the user at `chrome://extensions` + re-record.
- **`popup.ts`** / **`popup.html`** — start/stop recording UI. Stop Recording wraps `submitDraft`
  in try/catch and guards on `result?.ok` so a failed submit surfaces a clear error message instead
  of silently hanging the extension's message channel.
- **`config.ts`** — points at the server's API base URL.

## Known environment quirks (not code bugs)

- Dev servers frequently die between sessions — restart via `preview_start`, verify with
  `curl http://localhost:4000/api/health`.
- `preview_screenshot` intermittently times out in this environment — prefer `preview_snapshot`
  (accessibility tree), or `preview_stop` + `preview_start` for a fresh tab if a tab seems stuck.
- Verification pattern that works reliably: curl-based (login → extract token → call endpoint →
  inspect JSON), since browser automation here is comparatively flaky.
