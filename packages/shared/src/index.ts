export type StepType = "navigate" | "click" | "input" | "change" | "keydown";

export interface RecordedStep {
  type: StepType;
  timestamp: number;
  url?: string; // navigate target
  /** Candidate CSS/Playwright selectors for the target element, most reliable first. Replay tries each in order. */
  selectors?: string[];
  value?: string; // typed/selected value for input/change
  inputType?: string; // e.g. text, email, password, search
  /**
   * For checkbox/radio steps: the element's raw value attribute. Filter
   * checkboxes on search sites carry their URL filter token here (booking.com:
   * "mealplan=1", "class=5"), which lets replay apply the filter by editing
   * the results URL instead of clicking a checkbox on a bot-protected page.
   */
  nativeValue?: string;
  /** Human-readable field name detected at record time (associated &lt;label&gt;, aria-label, or placeholder). */
  label?: string;
  tagName?: string;
  key?: string; // for keydown (e.g. "Enter")
  /** Best-effort step (e.g. dismissing a cookie banner): skip silently if not found during replay instead of failing the run. */
  optional?: boolean;
}

export interface RecordingSession {
  id: string;
  ownerId: string;
  startUrl: string;
  createdAt: string;
  steps: RecordedStep[];
}

export type ParamType = "text" | "number" | "date" | "checkbox" | "location" | "currency";

export interface ParameterDef {
  key: string; // slug used as form field name / API input key
  label: string; // human friendly label
  selector: string; // display-only: the primary recorded selector for this field
  stepIndex: number; // index into automation.steps this substitutes
  defaultValue: string;
  type: ParamType;
  /**
   * If set, this parameter substitutes into a query-string parameter on the
   * navigate step at stepIndex instead of the step's value/selector. This is
   * how click-driven sites (custom date pickers, autocomplete lists - no
   * native <input>/<select> at all) still expose changeable search state,
   * since that state almost always ends up in the URL after the search runs.
   */
  urlParam?: string;
}

export interface ParameterCandidate {
  selector: string; // display-only: primary (most reliable) selector
  stepIndex: number;
  sampleValue: string;
  inputType?: string;
  suggestedLabel: string;
  /** Set when this candidate came from a URL query parameter rather than a form field. */
  urlParam?: string;
}

/** A single named piece of information to extract from the page after replay. */
export interface OutputField {
  key: string;
  label: string;
  selectors: string[];
}

export type LicenseMode = "unlimited" | "single" | "bulk100" | "subscription";

export interface Automation {
  id: string;
  ownerId: string;
  name: string;
  startUrl: string;
  steps: RecordedStep[];
  parameters: ParameterDef[];
  outputEnabled: boolean;
  outputFields: OutputField[];
  createdAt: string;
  /** "unlimited" unless this is a marketplace-purchased copy with a metered/expiring license. */
  licenseMode: LicenseMode;
  usesRemaining?: number | null;
  subscriptionExpiresAt?: string | null;
  purchasedFromListingId?: string | null;
  /** True if a captured login session (cookies) is stored for this automation. The encrypted
   *  cookie blob itself is never sent to the client - only this flag and the timestamp. */
  hasLoginSession: boolean;
  sessionCapturedAt?: string | null;
}

/** A single cookie as returned by chrome.cookies.getAll() in the extension. */
export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  expirationDate?: number;
  hostOnly?: boolean;
}

export interface SessionConnectTokenResult {
  connectToken: string;
  targetUrl: string;
}

export interface RunRequest {
  values: Record<string, string>;
}

export interface FailedStep {
  index: number;
  type: StepType;
  selectors: string[];
}

export interface ResultItem {
  title: string;
  /** A currency/price-like snippet found on the card, if any (e.g. "$45", "1,200 BDT"). */
  price?: string;
  /** Other short distinct text lines found on the card (rating, location, review count, etc). */
  details?: string[];
  image?: string;
  url?: string;
}

export interface RunResult {
  success: boolean;
  output?: Record<string, string> | null;
  error?: string;
  durationMs: number;
  /** Present when a non-optional step couldn't be resolved during replay. */
  failedStep?: FailedStep;
  /** Base64 JPEG screenshot taken at the point of failure, for debugging on real sites. */
  screenshot?: string;
  /** The page URL the replay ended on. Offered as a manual "open the real page" link. */
  finalUrl?: string;
  /** Best-effort scrape of the repeated result cards on the final page (search results, listings, etc). */
  resultItems?: ResultItem[];
}

export interface AutomationDocs {
  id: string;
  name: string;
  endpoint: string;
  method: "POST";
  inputs: { key: string; label: string; type: ParamType; required: boolean }[];
  output: { enabled: boolean; fields: { key: string; label: string }[]; description: string };
}

/**
 * A "send email" automation - not a browser recording. Sends via SMTP with a
 * Gmail app password rather than scripting Gmail's web UI, since Google
 * actively blocks automated browser sign-ins.
 */
export interface EmailAutomation {
  id: string;
  ownerId: string;
  name: string;
  fromEmail: string;
  to: string;
  toChangeable: boolean;
  subject: string;
  subjectChangeable: boolean;
  body: string;
  bodyChangeable: boolean;
  createdAt: string;
}

export interface EmailRunResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

export type PricingMode = "single" | "bulk100" | "subscription";

/**
 * A browser automation listed for sale. Email automations can't be listed -
 * they carry the seller's encrypted Gmail app password, which would leak to
 * the buyer if cloned.
 */
export interface MarketplaceListing {
  id: string;
  sellerId: string;
  sellerEmail: string;
  sourceAutomationId: string;
  name: string;
  description: string;
  pricingMode: PricingMode;
  price: number; // BDT
  createdAt: string;
}

export interface PurchaseResult {
  automationId: string;
  pricePaid: number;
  platformFee: number;
  sellerPayout: number;
}

export type SubscriptionPlan = "free" | "builder" | "pro" | "enterprise";

export interface PlanInfo {
  plan: SubscriptionPlan;
  planRenewsAt: string | null;
  dailyCreationLimit: number | null; // null = unlimited
  creationsToday: number;
}

export interface SubscribeResult {
  plan: SubscriptionPlan;
  pricePaid: number;
  planRenewsAt: string;
}

export interface ForgotPasswordResult {
  ok: true;
  /** Only present when the server has no platform email configured (dev fallback) -
   *  see systemMailer.ts. Never sent when a real reset email was dispatched. */
  devResetLink?: string;
}
