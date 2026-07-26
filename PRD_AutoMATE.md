# PRD — Product Requirements Document

### AutoMATE

*As-built update — reflects the product as implemented, superseding `PRD_FlowForge_7.pdf`. Revised July 26, 2026: adds the marketplace wallet, self-growing run-form fields, and live deployment.*

---

## 1. What This Is

AutoMATE is a web platform that watches a user complete a task in their browser one time, then replays it afterwards as a reusable, parameterized REST API — on any website, not just a fixed list of supported ones.

The example from the original pitch still holds: search for show tickets once, normally, while the extension quietly records what you click and type. Afterwards, you get a fill-in-the-blanks form — show name, date — and pressing "Go" replays the search with your new details. The same idea now also covers a second, different kind of automation built specifically for sending email, for tasks that aren't a website search at all (see Section 5).

The problem it solves hasn't changed: people repeat the same online tasks constantly, and the tools that could automate them usually require programming skills. AutoMATE lets anyone set one up just by showing it once.

## 2. What It Does

- Lets you set up an automation just by recording yourself doing it once — no coding — using a Chrome browser extension.
- Notices the details you'd likely want to change later (a destination, a date, a quantity, a search term, a currency, a filter) and offers each as an editable field, with the right kind of control for its type — a date picker, a number box, a live-suggesting location search, a currency dropdown.
- Grows or shrinks a group of related fields on its own — for example, raising the number of children on a hotel search adds a real, independently editable age field for each new one, instead of guessing a value or leaving it blank.
- Also supports a second, purpose-built automation type for sending email through your own Gmail account — for actions, not searches.
- Handles websites that require you to be signed in without ever storing or replaying a password (see Section 10).
- Runs the task again with your new details and shows results two ways: an automatic best-effort scrape of the results page (titles, prices, images) with zero setup, plus any specific fields you chose to extract by hand — or just confirms the task ran, for automations with no output to show.
- Works across all kinds of websites — ticket sites, hotel and flight search, and anything else with a fill-in-and-search flow.
- Generates each automation as a documented REST API, with a ready-to-copy example request.
- Includes a built-in marketplace, backed by a mock wallet balance, to list, price, and sell automations to other users — with safeguards against ever listing something that would leak a password or an active login session.
- Catches bad input before running — garbage numbers, expired dates, unrecognized destinations — with a clear, specific message next to the field instead of a broken or cryptic run.
- Supports light, dark, and system-matched appearance, consistent between the web app and the recording extension.

## 3. Who It's For

The main user is an ordinary person who keeps doing the same online task and just wants the outcome without repeating the legwork. A second type of user records something broadly useful and lists it on the marketplace to earn from other people using it.

In their own words:

- I want to show the tool how to do a task, so it can learn it.
- I want to change a few details in an easy form, and have it tell me if something I typed doesn't make sense.
- I want to choose whether I need output back or not.
- I want clear results when I do ask for them, even without setting anything up by hand.
- I want to save it and use it again later without setting it up from scratch.
- I want it to keep working even if the website changes slightly.
- I want to sell a useful automation I made and earn money from it — without handing over my password to the buyer.

## 4. How It Works, Step by Step

**Step 1 — Record.** Install the extension, click its icon, press Start Recording, do the task on the website like normal, then press Stop Recording. You're taken straight to a review screen — there's no separate credentials prompt at this stage; login-gated sites are handled differently (Section 10).

**Step 2 — Review and parameterize.** You see a plain-English summary of what you did, plus every field AutoMATE thinks you might want to change, each with a suggested name and the right input type. Leave a field checked to make it changeable every run, or uncheck it to bake in the value you used while recording — you can still edit that fixed value before saving.

**Step 3 — Create the automation.** Creating it counts against your plan's daily creation limit (Section 6) — there is no separate per-automation fee, unlike the original concept.

**Step 4 — Choose your output.** Toggle whether you want structured results back. With it on, and if the recording ended on a results-style page, AutoMATE automatically tries to pick out a list of result cards with zero configuration, in addition to any specific fields you chose to extract.

**Step 5 — Run it.** Fill in the changeable fields and press Go — any field tied to a count (Section 11) grows or shrinks as you change that count. Bad input is caught immediately, before anything runs. Every saved automation sits in your "My APIs" list, ready to run again anytime, or to call directly as a REST API using your own account token.

## 5. Two Kinds of Automations

**Browser automations** — recorded from any website via the extension, replayed in a real (headless) browser, with the resilience and validation behavior described in Section 11.

**Email automations** — built directly in the web app rather than recorded: connect a Gmail address secured with an app password (encrypted at rest, never sent back to the browser once saved), set a recipient, subject, and body — each optionally changeable per run — and running it sends the email through your own account. Email automations can never be listed on the marketplace, since doing so would hand the buyer your encrypted Gmail credential.

## 6. Subscription Plans

Every user starts on Free. Plans gate how many new automations you can create per day — not how many times you can run automations you've already built, which is always unlimited.

- **Free (Starter)** — 5 automation-creation attempts per day. Good for trying things out.
- **Builder** — 1,500 BDT/month — 30 creation attempts per day. Unlimited runs. Priority support (label only for now).
- **Pro** — 3,500 BDT/month — Unlimited creation attempts. Unlimited runs. Half-price marketplace platform fees when selling. Early access (label only for now).
- **Enterprise** — Custom pricing — Everything in Pro; "Contact us" only, not self-serve yet.

Subscribing to a paid plan is simulated and separate from the wallet described below — see Section 8, Billing and Payments. It takes effect immediately in the app with no real charge and without touching your wallet balance.

## 7. The Marketplace

A user who creates a broadly useful automation can list it and earn from other people using it. The seller picks how it's sold:

- **Per single use** — the buyer pays once per run.
- **Per 100 uses** — a bulk pack, metered down as the buyer runs it.
- **Monthly subscription** — unlimited use for the buyer for 30 days, then it expires unless purchased again.

The seller sets the price. The platform's cut is dynamic, shrinking as the sale gets bigger — rewarding sellers who build popular, high-value automations:

- Orders under 500 BDT — the platform takes 20%.
- Orders between 500 and 2,000 BDT — the platform takes 15%.
- Orders between 2,000 and 10,000 BDT — the platform takes 10%.
- Orders above 10,000 BDT — the platform takes 7%.

Sellers on the Pro or Enterprise plan pay half that rate on every sale — the "lower platform fees" perk from Section 6.

Buying a listing spends from the buyer's mock wallet balance (Section 8): the full price is deducted from the buyer and the payout (price minus platform fee) is credited straight to the seller's own wallet. Trying to buy something that costs more than your current balance is blocked outright, with a message stating exactly how much more you'd need to top up — it no longer silently succeeds for free. Once paid, the listing clones the automation into the buyer's own account as an independent, licensed copy, with its remaining uses or subscription expiry tracked automatically on that copy.

Two categories can never be listed, enforced by the platform itself, not just policy: email automations (would leak the seller's Gmail app password to the buyer), and any browser automation with a connected login session (would hand the buyer standing access to the seller's account).

## 8. Billing and Payments

No real payment processing exists yet — by deliberate design choice while the product is still being built, not an oversight. Subscribing to a plan still instantly succeeds and updates the account's state in the database, with no real charge, card, or bKash transaction involved anywhere.

What is real — within the mock economy — is the wallet. Every account has a BDT balance shown on the Dashboard, which can be topped up for any amount, instantly and for free, with one click; no card, bKash flow, or other real payment method is involved in topping up either. That balance is what marketplace purchases actually spend and earn (Section 7): buying deducts the price from the buyer's balance and credits the seller's, and a purchase you can't afford is refused rather than waved through. The platform's fee cut isn't paid out to anyone — it's simply not credited, the same way a real marketplace's commission works.

The pricing model itself is fully designed and enforced everywhere it should apply: BDT-denominated prices, bKash named as the intended primary payment method for the Bangladesh market, and the dynamic marketplace fee tiers from Section 7. Wiring real money in — both for subscriptions and for funding a wallet top-up — to a real payment processor (bKash, card, bank transfer) is the clear next milestone before real money can move through the platform.

## 9. REST API and Documentation

Every automation is structured as a proper REST API:

- Each automation has its own endpoint that accepts the changeable fields as input and returns the results as structured JSON.
- Documentation is generated automatically for each one — what it does, what inputs it takes, what it returns, and a ready-to-copy curl example using your own account token.

This makes an automation usable not just through the web app's own form, but by any developer who wants to call it from their own tools or workflows.

## 10. Handling Sites That Require Login

Some tasks — posting in a locked classroom system, for example — only work if you're signed in. AutoMATE deliberately never asks for or stores a password, and never fills in a login form on your behalf: scripted logins are unreliable against modern sites (two-factor prompts, CAPTCHAs, single sign-on) and represent a bigger security risk than the convenience is worth.

Instead, a session-capture flow is used: click "Connect login session" on the automation, which opens the site in a new tab and copies a one-time connect code to your clipboard. Log in there normally, the way you always do — AutoMATE has no part in that step. Click the extension icon and "Capture session for this tab"; the code fills in automatically, and your logged-in session (not your password) is captured and stored encrypted. Every run afterward replays that session. Sessions can go stale if the site logs you out on its own; reconnect anytime with the same flow.

## 11. Reliability and Input Validation

- **Multiple selector strategies** — a recording captures several independent ways to find the same element (id, name, associated label text, visible text, structural position), so an automation keeps working even if a site's layout shifts slightly between recording and replay.
- **Rich-text field support** — works with contenteditable compose boxes (an announcement box, a message body), not just plain form fields.
- **Run-time validation** — before anything runs, every changeable field is checked against its type: a number field rejects non-numbers and unrealistically large values, a date field rejects invalid or past dates, required fields can't be left empty, a location field is checked against the target site's own destination search, and an email field must look like a real address. Problems show up next to the field before the run starts, both in the web app and as a backstop on the API itself for anyone calling it directly.
- **Self-growing field groups** — when a recorded site ties a count to a repeated set of values (one age field per child, for example), the run form grows or shrinks that group live as the count changes. Each new slot is a real, independently editable field — not a value borrowed from the last one and not left to default to zero.
- **Screenshot on failure** — a run that fails partway through returns a screenshot of the page at that moment, to help diagnose what went wrong.
- **Friendly field names** — cryptic technical field names are shown in plain English, and where a site bundles several filters into one raw value behind the scenes, that value is shown broken out in readable terms. Purely internal, technical parameters with no real user-facing control behind them (a site's internal routing target, a bare search-scope flag) are hidden entirely rather than shown as something to "change."
- **Generic result scraping** — a best-effort scrape recognizes a repeated list of result cards automatically; when a search genuinely returns just one match with no siblings to pattern-match against, a fallback still finds and shows that single card instead of silently displaying nothing. When a search legitimately returns nothing, the app says so plainly ("No results found for this search query") instead of showing a blank area.

## 12. Appearance

The web app supports light, dark, and system-matched themes, chosen from the navbar and remembered between visits. The browser extension's popup automatically matches whichever theme is active in the web app, so the two never look out of sync. The in-page recording indicator sits in the bottom-right corner, out of the way of a page's own header and controls.

## 13. Account and Security

- Sign up and log in with email and password.
- Forgot your password — reset it via a time-limited link, emailed to you.
- Delete your account at any time from your profile — this permanently removes it and everything tied to it (automations, listings, purchase history), confirmed with a typed "DELETE" before it happens. There is no way back.
- Sensitive values — Gmail app passwords and captured login sessions — are encrypted at rest and never sent back to the browser once saved.

## 14. Deployment

The product now runs live on the internet, not just on a development machine, with the web app and the automation-running server deployed separately — matching what each actually needs rather than forcing both onto one host.

- The web app is built to static files and served from Vercel — fast, and well-suited to a purely static frontend.
- The server — which launches a real (headless) browser to replay automations, and keeps the account database — runs on Render, a host built for always-on processes. A burst-only serverless platform like Vercel isn't built to hold a live browser process or a persistent database file, so it deploys separately, on infrastructure suited to it.
- The two sides connect purely through configuration — the web app is told where the server lives — so either one can be redeployed, restarted, or replaced independently without touching the other.

## 15. How We'll Know It Worked

- The full loop — record, review, create, run — works end to end without the user needing to fix anything by hand.
- Running a saved automation with different details gives correct results most of the time, and keeps working across small changes to the target site's layout.
- It correctly spots the details a user would want to change, with sensible default labels and input types, and grows a repeated group cleanly when its count goes up.
- The output toggle works cleanly — automatic results and chosen fields when wanted, a simple confirmation when not.
- Bad input is caught before a run starts, with a message specific enough to fix the problem.
- A first-time user can get through the whole flow just by reading what's on screen.
- Marketplace sellers can list, price, and have listings purchased — with the wallet actually enforcing who can afford what, on the current mock-money basis.

## 16. Deliberate Limits — What's Not Built, On Purpose

These are current, intentional boundaries, not bugs to be quietly fixed later:

- No real payment processing yet (Section 8) — including the wallet used for marketplace purchases, which can currently be topped up for free with no real money involved. The pricing model is fully designed; connecting it to bKash/cards is the next milestone, not an oversight.
- Email automations and automations with a connected login session can never be listed on the marketplace (Sections 5, 7, 10) — a self-imposed security boundary.
- No automation ever scripts a login form — login-gated sites use session capture only (Section 10).
- The replay engine always runs headless, with no visible browser window — a requirement of the environment it runs in.
- The Chrome extension isn't published on the Chrome Web Store yet — it installs in developer mode from a downloadable zip.

## 17. Ideas for Later

Beyond connecting real payments (both for subscriptions and for funding wallet top-ups) and publishing the extension to the Chrome Web Store: running automations automatically on a schedule and messaging the results, letting teams collaborate on shared automations, ratings and reviews on marketplace listings, and payment options beyond bKash as the product grows.

## 18. Conclusion

AutoMATE still takes something everyone finds tedious — repeating the same online task — and turns it into a service anyone can set up by showing it once. What's changed since the original pitch is scope and honesty about what's real: a second automation type for email, a session-capture path for login-gated sites that never touches a password, real input validation and resilience work instead of an optimistic assumption that recordings just keep working, run-form fields that grow and shrink on their own instead of guessing, a mock wallet that makes marketplace buying and selling behave like a real economy without any real money changing hands, a redesigned interface with full theming, and the product now actually deployed and reachable on the internet rather than only on a development machine. The one piece still ahead of where the original PRD assumed it would be is real money movement — every price, fee, wallet balance, and plan is fully designed and enforced, waiting on a real payment processor to be wired in.
