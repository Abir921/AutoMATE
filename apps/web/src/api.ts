import type {
  Automation,
  AutomationDocs,
  EmailAutomation,
  EmailRunResult,
  ForgotPasswordResult,
  MarketplaceListing,
  OutputField,
  ParameterCandidate,
  ParameterDef,
  PlanInfo,
  PricingMode,
  PurchaseResult,
  RecordedStep,
  RunResult,
  SessionConnectTokenResult,
  SubscribeResult,
  SubscriptionPlan,
} from "@automate/shared";

const API_BASE = "http://localhost:4000/api";

export function getToken(): string | null {
  return localStorage.getItem("automate_token");
}

export function setToken(token: string): void {
  localStorage.setItem("automate_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("automate_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && token) {
    // The token is stale (expired, or points at an account that no longer
    // exists) - clear it and bounce to login instead of dead-ending on a
    // page that will just keep failing every request.
    clearToken();
    window.location.href = "/login";
    throw new Error("Your session expired. Please log in again.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  signup: (email: string, password: string, name: string) =>
    request<{ token: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgotPassword: (email: string) =>
    request<ForgotPasswordResult>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  getDraft: (id: string) =>
    request<{
      id: string;
      startUrl: string;
      steps: RecordedStep[];
      outputFields: OutputField[];
      candidates: ParameterCandidate[];
    }>(`/drafts/${id}`),

  createAutomation: (input: {
    draftId: string;
    name: string;
    parameters: ParameterDef[];
    outputEnabled: boolean;
    outputFields?: OutputField[];
    stepOverrides?: { stepIndex: number; value: string; urlParam?: string }[];
  }) => request<{ id: string }>("/automations", { method: "POST", body: JSON.stringify(input) }),

  listAutomations: () => request<Automation[]>("/automations"),
  getAutomation: (id: string) => request<Automation>(`/automations/${id}`),
  renameAutomation: (id: string, name: string) =>
    request<void>(`/automations/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteAutomation: (id: string) => request<void>(`/automations/${id}`, { method: "DELETE" }),
  getDocs: (id: string) => request<AutomationDocs>(`/automations/${id}/docs`),
  runAutomation: (id: string, values: Record<string, string>) =>
    request<RunResult>(`/automations/${id}/run`, { method: "POST", body: JSON.stringify({ values }) }),
  suggestLocations: (id: string, paramKey: string, query: string) =>
    request<{ suggestions: string[] }>(`/automations/${id}/suggest`, {
      method: "POST",
      body: JSON.stringify({ paramKey, query }),
    }),
  createSessionConnectToken: (id: string) =>
    request<SessionConnectTokenResult>(`/automations/${id}/session/connect-token`, { method: "POST" }),
  disconnectSession: (id: string) => request<void>(`/automations/${id}/session`, { method: "DELETE" }),

  getMe: () =>
    request<
      { email: string; name: string | null; createdAt: string; avatar: string | null; automationCount: number } & PlanInfo
    >("/me"),
  updateAvatar: (avatar: string) =>
    request<{ avatar: string }>("/me/avatar", { method: "PUT", body: JSON.stringify({ avatar }) }),
  deleteAccount: () => request<void>("/me", { method: "DELETE" }),

  listEmailAutomations: () => request<EmailAutomation[]>("/email-automations"),
  getEmailAutomation: (id: string) => request<EmailAutomation>(`/email-automations/${id}`),
  renameEmailAutomation: (id: string, name: string) =>
    request<void>(`/email-automations/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteEmailAutomation: (id: string) => request<void>(`/email-automations/${id}`, { method: "DELETE" }),
  createEmailAutomation: (input: {
    name: string;
    fromEmail: string;
    appPassword: string;
    to: string;
    toChangeable: boolean;
    subject: string;
    subjectChangeable: boolean;
    body: string;
    bodyChangeable: boolean;
  }) => request<{ id: string }>("/email-automations", { method: "POST", body: JSON.stringify(input) }),
  runEmailAutomation: (id: string, values: Record<string, string>) =>
    request<EmailRunResult>(`/email-automations/${id}/run`, { method: "POST", body: JSON.stringify({ values }) }),

  listListings: () => request<MarketplaceListing[]>("/marketplace/listings"),
  getListing: (id: string) => request<MarketplaceListing>(`/marketplace/listings/${id}`),
  createListing: (input: {
    sourceAutomationId: string;
    name: string;
    description: string;
    pricingMode: PricingMode;
    price: number;
  }) => request<{ id: string }>("/marketplace/listings", { method: "POST", body: JSON.stringify(input) }),
  deleteListing: (id: string) => request<void>(`/marketplace/listings/${id}`, { method: "DELETE" }),
  purchaseListing: (id: string) =>
    request<PurchaseResult>(`/marketplace/listings/${id}/purchase`, { method: "POST" }),

  getSubscription: () => request<PlanInfo>("/subscription"),
  subscribe: (plan: SubscriptionPlan) =>
    request<SubscribeResult>("/subscription/purchase", { method: "POST", body: JSON.stringify({ plan }) }),
};
