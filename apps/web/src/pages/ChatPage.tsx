import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "../api";

type Message = { id: string; role: string; content: string; createdAt: string };

type Session = {
  id: string;
  taxYear: number;
  state: string;
  requiresAdditionalReview: boolean;
  messages: Message[];
};

type IncomeRow = {
  id: string;
  taxYear: number;
  payerName: string;
  originCountry: string;
  incomeType: string;
  grossAmount: string;
  originalCurrency: string;
  paymentDate: string;
  periodicity: "monthly" | "annual" | "one_off" | "recurring";
  nature: "work" | "investment" | "retirement" | "asset" | "corporate" | "trust" | "other";
};

type DeductionRow = {
  id: string;
  taxYear: number;
  deductionType: string;
  amount: string;
  currency: string;
  taxPeriod: string;
  applicationScope: "monthly" | "annual" | "transaction";
};

type AnnualEstimateRow = {
  jurisdiction?: string;
  currency?: string;
  grossIncome?: number;
  taxableBase?: number;
  grossTax?: number;
  taxCreditApplied?: number | null;
  netTaxDue?: number;
  calculationStatus?: string;
};

type MonthlyCarnetRow = {
  taxMonth?: string;
  taxableBase?: number | string;
  netTaxDue?: number | string;
  calculationStatus?: string;
  requiresAdditionalReview?: boolean;
};

type ReportSummaryJson = {
  fiscalProfile?: string;
  annualTaxEstimates?: AnnualEstimateRow[];
  monthlyCarnetLeao?: MonthlyCarnetRow[];
  capitalGains?: Array<{ assetType?: string; gainAmount?: number | string; taxEstimate?: number | string }>;
  estimatesDisclaimer?: string;
};

type FullTaxReport = {
  id: string;
  taxYear: number;
  title: string;
  createdAt: string;
  requiresAdditionalReview: boolean;
  summaryJson: ReportSummaryJson;
};

const STEP_ORDER = [
  { id: "fiscal_residence", label: "Fiscal profile" },
  { id: "income_capture", label: "Income" },
  { id: "events", label: "Derived events" },
  { id: "capital_gain", label: "Capital gains" },
  { id: "deductions", label: "Deductions" },
  { id: "monthly_calc", label: "Monthly tax" },
  { id: "report", label: "Report" },
  { id: "complete", label: "Done" }
] as const;

const WHY_HINT_BY_STATE: Record<string, string> = {
  fiscal_residence: "Why this matters: this determines your residency tax rules and filing scope.",
  income_capture: "Why this matters: income details drive taxable events and monthly tax estimates.",
  events: "Why this matters: we confirm how your income rows classify as taxable events before continuing.",
  deductions: "Why this matters: eligible deductions can reduce your final taxable base.",
  capital_gain: "Why this matters: sale/acquisition details determine capital gain tax treatment.",
  monthly_calc: "Why this matters: month-by-month Carnê-Leão estimates for foreign income (when applicable).",
  report: "Why this matters: we assemble a complete summary for review and export.",
  complete: "Your intake is complete. You can now review or export your summary."
};

const INCOME_QUICK_ADDS = [
  {
    label: "Salary template",
    text: "Salary from US employer, paid monthly, 5000 USD, payment date 2026-01-31."
  },
  {
    label: "Dividend template",
    text: "Dividend from US broker, 350 USD, payment date 2026-02-15."
  },
  {
    label: "Freelance template",
    text: "Freelance income from Brazil client, 8000 BRL, payment date 2026-03-10."
  }
] as const;

function stepProgress(state: string): { index: number; total: number } {
  const idx = STEP_ORDER.findIndex((s) => s.id === state);
  return { index: Math.max(0, idx) + 1, total: STEP_ORDER.length };
}

function formatMoney(n: unknown, currency = ""): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "—";
  const s = Math.abs(num).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

const welcomeBannerStorageKey = (id: string) => `tax-platform-chat-dismiss-welcome-${id}`;
const reviewBannerStorageKey = (id: string) => `tax-platform-chat-dismiss-review-${id}`;
const noticeReadIdsStorageKey = (id: string) => `tax-platform-chat-notices-read-${id}`;

function loadNoticeReadIds(sessionId: string): Set<string> {
  try {
    const raw = localStorage.getItem(noticeReadIdsStorageKey(sessionId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveNoticeReadIds(sessionId: string, ids: Set<string>): void {
  localStorage.setItem(noticeReadIdsStorageKey(sessionId), JSON.stringify([...ids]));
}

const NOTICE_WELCOME_BACK = {
  id: "welcome_back",
  title: "Welcome back",
  body: "Welcome back. We saved your progress automatically and will continue from the current step."
} as const;

const NOTICE_ADDITIONAL_REVIEW = {
  id: "additional_review",
  title: "Additional review",
  body: "This case is flagged for **additional review** (complex residence, trust-like income, or similar). Results are preliminary."
} as const;

type SessionNotice = {
  id: string;
  title: string;
  body: string;
  kind: "welcome" | "review";
};

function activeSessionNotices(session: Session): SessionNotice[] {
  const list: SessionNotice[] = [];
  if (session.messages.length > 1) {
    list.push({
      id: NOTICE_WELCOME_BACK.id,
      title: NOTICE_WELCOME_BACK.title,
      body: NOTICE_WELCOME_BACK.body,
      kind: "welcome"
    });
  }
  if (session.requiresAdditionalReview) {
    list.push({
      id: NOTICE_ADDITIONAL_REVIEW.id,
      title: NOTICE_ADDITIONAL_REVIEW.title,
      body: NOTICE_ADDITIONAL_REVIEW.body,
      kind: "review"
    });
  }
  return list;
}

/** Renders `**like this**` as bold; keeps newlines (same as markdown emphasis). */
function renderChatEmphasis(text: string): ReactNode {
  const re = /\*\*([\s\S]*?)\*\*/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${k++}`}>{text.slice(last, m.index)}</span>);
    }
    parts.push(
      <strong key={`b${k++}`} className="font-semibold text-slate-100">
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={`t${k++}`}>{text.slice(last)}</span>);
  }
  return parts.length > 0 ? parts : text;
}

export function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [lastSavedSnippet, setLastSavedSnippet] = useState<string>("");
  const [showIncomeEditor, setShowIncomeEditor] = useState(false);
  const [incomeDraftRows, setIncomeDraftRows] = useState<IncomeRow[]>([]);
  const [savingIncomeId, setSavingIncomeId] = useState<string>("");
  const [incomeError, setIncomeError] = useState<string>("");
  const [showDeductionEditor, setShowDeductionEditor] = useState(false);
  const [deductionDraftRows, setDeductionDraftRows] = useState<DeductionRow[]>([]);
  const [savingDeductionId, setSavingDeductionId] = useState<string>("");
  const [deductionError, setDeductionError] = useState<string>("");
  const [navigatingStep, setNavigatingStep] = useState(false);
  const [hideWelcomeBanner, setHideWelcomeBanner] = useState(false);
  const [hideReviewBanner, setHideReviewBanner] = useState(false);
  const [noticeCenterOpen, setNoticeCenterOpen] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(() => new Set());
  const noticeCenterRef = useRef<HTMLDivElement>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api<Session>(`/api/sessions/${sessionId}`),
    enabled: Boolean(sessionId)
  });

  const { data: incomeRows = [], isFetching: loadingIncomes } = useQuery({
    queryKey: ["incomes", sessionId, session?.taxYear],
    queryFn: async (): Promise<IncomeRow[]> => {
      const rows = await api<
        Array<{
          id: string;
          taxYear: number;
          payerName: string;
          originCountry: string;
          incomeType: string;
          grossAmount: string | number;
          originalCurrency: string;
          paymentDate: string;
          periodicity: IncomeRow["periodicity"];
          nature: IncomeRow["nature"];
        }>
      >(`/api/incomes?taxYear=${session!.taxYear}`);
      return rows.map((r) => ({
        ...r,
        grossAmount: String(r.grossAmount),
        paymentDate: String(r.paymentDate).slice(0, 10)
      }));
    },
    enabled: Boolean(sessionId && session?.state === "income_capture")
  });

  const { data: deductionRows = [], isFetching: loadingDeductions } = useQuery({
    queryKey: ["deductions", sessionId, session?.taxYear],
    queryFn: async (): Promise<DeductionRow[]> => {
      const rows = await api<
        Array<{
          id: string;
          taxYear: number;
          deductionType: string;
          amount: string | number;
          currency: string;
          taxPeriod: string;
          applicationScope: DeductionRow["applicationScope"];
        }>
      >(`/api/deductions?taxYear=${session!.taxYear}`);
      return rows.map((r) => ({
        ...r,
        amount: String(r.amount)
      }));
    },
    enabled: Boolean(sessionId && session?.state === "deductions")
  });

  type LatestReportMeta = { id: string; taxYear: number; title: string; createdAt: string };
  const { data: latestReportMeta } = useQuery({
    queryKey: ["taxReportLatest", sessionId, session?.taxYear],
    queryFn: async (): Promise<LatestReportMeta | null> => {
      const taxYear = session!.taxYear;
      const token = getToken();
      const res = await fetch(`/api/report/latest?taxYear=${taxYear}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as LatestReportMeta;
    },
    enabled: Boolean(
      sessionId && session && (session.state === "complete" || session.state === "report")
    ),
    staleTime: 15_000
  });

  const { data: fullReport } = useQuery({
    queryKey: ["taxReportFull", latestReportMeta?.id],
    queryFn: async (): Promise<FullTaxReport | null> => {
      if (!latestReportMeta?.id) return null;
      const token = getToken();
      const res = await fetch(`/api/report/${latestReportMeta.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as FullTaxReport;
    },
    enabled: Boolean(latestReportMeta?.id),
    staleTime: 15_000
  });

  useEffect(() => {
    if (session?.messages?.length) {
      const el = document.getElementById("chat-end");
      el?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.messages, optimisticMessages, assistantTyping, typingDots]);

  useEffect(() => {
    if (!assistantTyping) return;
    const id = window.setInterval(() => {
      setTypingDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 350);
    return () => window.clearInterval(id);
  }, [assistantTyping]);

  useEffect(() => {
    // Reset transient UI state when switching to a different session.
    setInput("");
    setOptimisticMessages([]);
    setAssistantTyping(false);
    setTypingDots(".");
    setLastSavedAt("");
    setLastSavedSnippet("");
    setSending(false);
    setResetting(false);
    if (sessionId) {
      setHideWelcomeBanner(localStorage.getItem(welcomeBannerStorageKey(sessionId)) === "1");
      setHideReviewBanner(localStorage.getItem(reviewBannerStorageKey(sessionId)) === "1");
      setReadNoticeIds(loadNoticeReadIds(sessionId));
    } else {
      setHideWelcomeBanner(false);
      setHideReviewBanner(false);
      setReadNoticeIds(new Set());
    }
  }, [sessionId]);

  useEffect(() => {
    setIncomeDraftRows(incomeRows);
  }, [incomeRows]);

  useEffect(() => {
    setDeductionDraftRows(deductionRows);
  }, [deductionRows]);

  useEffect(() => {
    if (!sessionId || !session) return;
    if (!session.requiresAdditionalReview) {
      localStorage.removeItem(reviewBannerStorageKey(sessionId));
      setHideReviewBanner(false);
    }
  }, [sessionId, session?.requiresAdditionalReview]);

  useEffect(() => {
    if (!noticeCenterOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = noticeCenterRef.current;
      if (el && !el.contains(e.target as Node)) {
        setNoticeCenterOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [noticeCenterOpen]);

  useEffect(() => {
    if (!sessionId || !session) return;
    setReadNoticeIds((prev) => {
      const applicable = new Set(activeSessionNotices(session).map((n) => n.id));
      const next = new Set<string>();
      let pruned = false;
      for (const id of prev) {
        if (applicable.has(id)) {
          next.add(id);
        } else {
          pruned = true;
        }
      }
      if (!pruned && next.size === prev.size) {
        return prev;
      }
      saveNoticeReadIds(sessionId, next);
      return next;
    });
  }, [sessionId, session?.messages.length, session?.requiresAdditionalReview]);

  useEffect(() => {
    if (!noticeCenterOpen || !sessionId || !session) return;
    const ids = activeSessionNotices(session).map((n) => n.id);
    setReadNoticeIds((prev) => {
      const next = new Set(prev);
      let added = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          added = true;
        }
      }
      if (!added) {
        return prev;
      }
      saveNoticeReadIds(sessionId, next);
      return next;
    });
  }, [noticeCenterOpen, sessionId, session]);

  const displayedMessages = [...(session?.messages ?? []), ...optimisticMessages];
  const currentState = session?.state ?? "fiscal_residence";
  const progress = stepProgress(currentState);
  const whyHint = WHY_HINT_BY_STATE[currentState] ?? "We will keep this short and one question at a time.";

  async function send(prefilledText?: string) {
    if (!sessionId || !session) return;
    const userText = (prefilledText ?? input).trim();
    if (!userText) return;
    const optimisticUserMessage: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString()
    };
    setOptimisticMessages((prev) => [...prev, optimisticUserMessage]);
    setAssistantTyping(true);
    setTypingDots(".");
    setInput("");
    setSending(true);
    try {
      await api<{ assistantText: string; sessionState: string }>(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: userText })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
      await qc.invalidateQueries({ queryKey: ["taxReportLatest", sessionId, session.taxYear] });
      setOptimisticMessages([]);
      setLastSavedAt(new Date().toLocaleTimeString());
      setLastSavedSnippet(userText.slice(0, 72));
    } finally {
      setAssistantTyping(false);
      setSending(false);
    }
  }

  async function downloadLatestReportJson() {
    if (!latestReportMeta) return;
    const token = getToken();
    const res = await fetch(`/api/report/${latestReportMeta.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      window.alert("Could not download the report. Try again or regenerate from chat.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-report-${latestReportMeta.taxYear}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function startOver() {
    if (!session) return;
    const confirmed = window.confirm("Start over and create a new blank chat session?");
    if (!confirmed) return;
    setResetting(true);
    try {
      const next = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ taxYear: session.taxYear })
      });
      nav(`/chat/${next.id}`);
    } finally {
      setResetting(false);
    }
  }

  async function jumpToStep(state: string) {
    if (!sessionId || !session || state === session.state) return;
    setNavigatingStep(true);
    try {
      await api(`/api/sessions/${sessionId}/advance`, {
        method: "POST",
        body: JSON.stringify({ state })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not move to selected step");
    } finally {
      setNavigatingStep(false);
    }
  }

  function updateIncomeDraft(id: string, key: keyof IncomeRow, value: string) {
    setIncomeDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addIncomeDraftRow() {
    if (!session) return;
    const id = `new-${Date.now()}`;
    setShowIncomeEditor(true);
    setIncomeDraftRows((prev) => [
      {
        id,
        taxYear: session.taxYear,
        payerName: "",
        originCountry: "US",
        incomeType: "salary",
        grossAmount: "",
        originalCurrency: "USD",
        paymentDate: `${session.taxYear}-01-31`,
        periodicity: "monthly",
        nature: "work"
      },
      ...prev
    ]);
  }

  async function saveIncomeRow(row: IncomeRow) {
    if (!session) return;
    setSavingIncomeId(row.id);
    setIncomeError("");
    try {
      const payload = {
        payerName: row.payerName.trim(),
        originCountry: row.originCountry.trim().toUpperCase(),
        incomeType: row.incomeType.trim(),
        grossAmount: Number(row.grossAmount),
        originalCurrency: row.originalCurrency.trim().toUpperCase(),
        paymentDate: row.paymentDate,
        periodicity: row.periodicity,
        nature: row.nature
      };
      if (row.id.startsWith("new-")) {
        await api("/api/incomes", {
          method: "POST",
          body: JSON.stringify({ taxYear: session.taxYear, income: payload })
        });
      } else {
        await api(`/api/incomes/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({ taxYear: session.taxYear, income: payload })
        });
      }
      await qc.invalidateQueries({ queryKey: ["incomes", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setIncomeError(err instanceof Error ? err.message : "Could not save income row");
    } finally {
      setSavingIncomeId("");
    }
  }

  function updateDeductionDraft(id: string, key: keyof DeductionRow, value: string) {
    setDeductionDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addDeductionDraftRow() {
    if (!session) return;
    const id = `new-${Date.now()}`;
    setShowDeductionEditor(true);
    setDeductionDraftRows((prev) => [
      {
        id,
        taxYear: session.taxYear,
        deductionType: "health",
        amount: "",
        currency: "BRL",
        taxPeriod: String(session.taxYear),
        applicationScope: "annual"
      },
      ...prev
    ]);
  }

  async function saveDeductionRow(row: DeductionRow) {
    if (!session) return;
    setSavingDeductionId(row.id);
    setDeductionError("");
    try {
      const payload = {
        deductionType: row.deductionType.trim(),
        amount: Number(row.amount),
        currency: row.currency.trim().toUpperCase(),
        taxPeriod: row.taxPeriod.trim(),
        applicationScope: row.applicationScope
      };
      if (row.id.startsWith("new-")) {
        await api("/api/deductions", {
          method: "POST",
          body: JSON.stringify({ taxYear: session.taxYear, deduction: payload })
        });
      }
      await qc.invalidateQueries({ queryKey: ["deductions", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDeductionError(err instanceof Error ? err.message : "Could not save deduction row");
    } finally {
      setSavingDeductionId("");
    }
  }

  async function deleteIncomeRow(row: IncomeRow) {
    if (!session) return;
    setIncomeError("");
    if (row.id.startsWith("new-")) {
      setIncomeDraftRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    setSavingIncomeId(row.id);
    try {
      await api(`/api/incomes/${row.id}?taxYear=${session.taxYear}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["incomes", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setIncomeError(err instanceof Error ? err.message : "Could not delete income row");
    } finally {
      setSavingIncomeId("");
    }
  }

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>
    );
  }

  const sessionNotices = activeSessionNotices(session);
  const unreadNoticeCount = sessionNotices.filter((n) => !readNoticeIds.has(n.id)).length;

  function restoreWelcomeBanner() {
    if (sessionId) localStorage.removeItem(welcomeBannerStorageKey(sessionId));
    setHideWelcomeBanner(false);
  }

  function restoreReviewBanner() {
    if (sessionId) localStorage.removeItem(reviewBannerStorageKey(sessionId));
    setHideReviewBanner(false);
  }

  return (
    <div className="h-screen overflow-hidden max-w-3xl mx-auto p-4">
      <div className="h-full flex flex-col rounded-xl border border-slate-800 bg-slate-950/40">
      <header className="relative border-b border-slate-800 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">Tax intake</h1>
          <div ref={noticeCenterRef} className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNoticeCenterOpen((o) => !o)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-600 flex items-center gap-2"
                aria-expanded={noticeCenterOpen}
                aria-haspopup="true"
              >
                Notifications
                {unreadNoticeCount > 0 ? (
                  <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNoticeCount}
                  </span>
                ) : null}
              </button>
              {noticeCenterOpen && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-xl"
                  role="dialog"
                  aria-label="Notification center"
                >
                  <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
                    Alerts &amp; notices
                  </div>
                  <div className="px-3 py-2 space-y-3 text-xs">
                    {sessionNotices.length === 0 ? (
                      <p className="text-slate-500">No notices for this session.</p>
                    ) : (
                      sessionNotices.map((n) => (
                        <div
                          key={n.id}
                          className={`rounded-md border px-2 py-2 ${
                            n.kind === "welcome"
                              ? "border-sky-800/60 bg-sky-950/40 text-sky-100"
                              : "border-amber-800/50 bg-amber-950/35 text-amber-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-100">{n.title}</p>
                            {!readNoticeIds.has(n.id) && (
                              <span className="shrink-0 rounded bg-sky-700/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-100">
                                Unread
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-slate-300 leading-snug">
                            {n.kind === "review" ? renderChatEmphasis(n.body) : n.body}
                          </p>
                          {n.kind === "welcome" && hideWelcomeBanner && (
                            <button
                              type="button"
                              onClick={() => {
                                restoreWelcomeBanner();
                              }}
                              className="mt-2 text-[11px] text-sky-300 underline hover:text-sky-200"
                            >
                              Show welcome banner again
                            </button>
                          )}
                          {n.kind === "review" && hideReviewBanner && (
                            <button
                              type="button"
                              onClick={() => {
                                restoreReviewBanner();
                              }}
                              className="mt-2 text-[11px] text-amber-300 underline hover:text-amber-200"
                            >
                              Show review banner again
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    <p className="text-[11px] text-slate-500 pt-1">
                      Opening this panel marks every notice above as read and clears the badge. Hiding a banner only
                      collapses it in the header; notices stay listed here while they still apply.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void startOver()}
              disabled={resetting}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-600 disabled:opacity-50"
            >
              {resetting ? "Starting over..." : "Start over"}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Year {session.taxYear} · Step <span className="text-emerald-400">{session.state}</span> ·{" "}
          {progress.index}/{progress.total}
        </p>
        <p className="mt-2 text-xs text-slate-400">{whyHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STEP_ORDER.map((step, idx) => {
            const active = step.id === session.state;
            const completed = idx + 1 < progress.index;
            return (
              <button
                key={step.id}
                type="button"
                disabled={sending || resetting || navigatingStep}
                onClick={() => void jumpToStep(step.id)}
                className={`rounded-full px-2 py-1 text-xs border ${
                  active
                    ? "border-emerald-500/60 bg-emerald-900/30 text-emerald-200"
                    : completed
                      ? "border-slate-600 bg-slate-800 text-slate-200"
                      : "border-slate-700 bg-slate-900 text-slate-400"
                } ${(sending || resetting || navigatingStep) ? "opacity-60 cursor-not-allowed" : "hover:border-emerald-600"}`}
              >
                {step.label}
              </button>
            );
          })}
        </div>
        {session.messages.length > 1 && !hideWelcomeBanner && (
          <div className="mt-3 rounded-lg border border-sky-800/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-100 flex gap-3 items-start justify-between">
            <p className="min-w-0 flex-1">{NOTICE_WELCOME_BACK.body}</p>
            <button
              type="button"
              onClick={() => {
                if (sessionId) localStorage.setItem(welcomeBannerStorageKey(sessionId), "1");
                setHideWelcomeBanner(true);
              }}
              className="shrink-0 rounded border border-sky-700/60 bg-sky-950 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-900"
            >
              Hide
            </button>
          </div>
        )}
        {session.requiresAdditionalReview && !hideReviewBanner && (
          <div
            className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 flex gap-3 items-start justify-between"
            role="status"
          >
            <p className="min-w-0 flex-1">{renderChatEmphasis(NOTICE_ADDITIONAL_REVIEW.body)}</p>
            <button
              type="button"
              onClick={() => {
                if (sessionId) localStorage.setItem(reviewBannerStorageKey(sessionId), "1");
                setHideReviewBanner(true);
              }}
              className="shrink-0 rounded border border-amber-700/60 bg-amber-950 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-900/50"
            >
              Hide
            </button>
          </div>
        )}
        {(session.state === "complete" || session.state === "report") && fullReport && (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-xs text-slate-200 space-y-3">
            <p className="text-sm font-medium text-emerald-200">Results summary</p>
            {fullReport.requiresAdditionalReview && (
              <p className="text-amber-200">
                Flagged for additional review — figures are preliminary orientation only.
              </p>
            )}
            {fullReport.summaryJson.annualTaxEstimates &&
              fullReport.summaryJson.annualTaxEstimates.length > 0 && (
                <div>
                  <p className="text-slate-400 mb-1">Annual estimates (per jurisdiction)</p>
                  <ul className="space-y-1">
                    {fullReport.summaryJson.annualTaxEstimates.map((est, i) => (
                      <li key={i}>
                        <strong>{est.jurisdiction}</strong> ({est.currency}): gross{" "}
                        {formatMoney(est.grossIncome, est.currency)} → net due{" "}
                        <strong>{formatMoney(est.netTaxDue, est.currency)}</strong> ({est.calculationStatus})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {fullReport.summaryJson.monthlyCarnetLeao &&
              fullReport.summaryJson.monthlyCarnetLeao.length > 0 && (
                <div>
                  <p className="text-slate-400 mb-1">Monthly Carnê-Leão</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-[420px] w-full text-[11px]">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="text-left pr-2">Month</th>
                          <th className="text-left pr-2">Base (BRL)</th>
                          <th className="text-left pr-2">Net due</th>
                          <th className="text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fullReport.summaryJson.monthlyCarnetLeao.map((m, i) => (
                          <tr key={i} className="border-t border-slate-800">
                            <td className="pr-2 py-0.5">{m.taxMonth}</td>
                            <td className="pr-2 py-0.5">{formatMoney(m.taxableBase, "BRL")}</td>
                            <td className="pr-2 py-0.5">{formatMoney(m.netTaxDue, "BRL")}</td>
                            <td className="py-0.5">
                              {m.calculationStatus}
                              {m.requiresAdditionalReview ? " ⚠" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            {fullReport.summaryJson.capitalGains && fullReport.summaryJson.capitalGains.length > 0 && (
              <div>
                <p className="text-slate-400 mb-1">Capital gains</p>
                <ul className="space-y-1">
                  {fullReport.summaryJson.capitalGains.map((cg, i) => (
                    <li key={i}>
                      {cg.assetType}: gain {formatMoney(cg.gainAmount)} · est. tax{" "}
                      {formatMoney(cg.taxEstimate)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fullReport.summaryJson.estimatesDisclaimer && (
              <p className="text-slate-500 italic">{fullReport.summaryJson.estimatesDisclaimer}</p>
            )}
          </div>
        )}
        {session.state === "complete" && (
          <div className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100 space-y-2">
            <p>
              <strong>Edit earlier steps:</strong> in chat, say e.g. <strong>go back to income</strong>,{" "}
              <strong>return to deductions</strong>, or <strong>update the report</strong> step.
            </p>
            <p>
              <strong>New report copy:</strong> say <strong>regenerate the report</strong> or{" "}
              <strong>generate again</strong>—each run saves another snapshot for this year.
            </p>
            {latestReportMeta ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-slate-400">Latest: {latestReportMeta.title}</span>
                <button
                  type="button"
                  onClick={() => void downloadLatestReportJson()}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-900/70"
                >
                  Download latest report (JSON)
                </button>
              </div>
            ) : (
              <p className="text-slate-400 pt-1">No report file on disk yet for this year—run generate from chat first.</p>
            )}
          </div>
        )}
      </header>
      <main className="chat-scrollbar flex-1 overflow-y-auto space-y-3 px-4 py-4">
        {displayedMessages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl px-4 py-2 max-w-[85%] ${
              m.role === "user"
                ? "ml-auto bg-emerald-900/40 border border-emerald-800/50"
                : "mr-auto bg-slate-900 border border-slate-800"
            }`}
          >
            <p className="text-xs uppercase text-slate-500 mb-1">{m.role}</p>
            <p className="whitespace-pre-wrap text-sm">{renderChatEmphasis(m.content)}</p>
          </div>
        ))}
        {assistantTyping && (
          <div className="rounded-xl px-4 py-2 max-w-[85%] mr-auto bg-slate-900 border border-slate-800">
            <p className="text-xs uppercase text-slate-500 mb-1">assistant</p>
            <p className="whitespace-pre-wrap text-sm text-slate-300">Typing{typingDots}</p>
          </div>
        )}
        <div id="chat-end" />
      </main>
      <footer className="border-t border-slate-800 px-4 py-4">
        {session.state === "deductions" && (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowDeductionEditor((v) => !v)}
                className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1 text-xs text-sky-200 hover:border-sky-500"
              >
                {showDeductionEditor ? "Hide deductions table" : "Open deductions table"}
              </button>
              <button
                type="button"
                onClick={addDeductionDraftRow}
                className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-500"
              >
                Add deduction
              </button>
            </div>
            {showDeductionEditor && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 overflow-x-auto">
                <table className="min-w-[720px] w-full text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Amount</th>
                      <th className="px-2 py-1 text-left">Currency</th>
                      <th className="px-2 py-1 text-left">Tax period</th>
                      <th className="px-2 py-1 text-left">Scope</th>
                      <th className="px-2 py-1 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionDraftRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="px-2 py-1">
                          <input
                            value={r.deductionType}
                            onChange={(e) => updateDeductionDraft(r.id, "deductionType", e.target.value)}
                            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.amount}
                            onChange={(e) => updateDeductionDraft(r.id, "amount", e.target.value)}
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.currency}
                            onChange={(e) => updateDeductionDraft(r.id, "currency", e.target.value)}
                            className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.taxPeriod}
                            onChange={(e) => updateDeductionDraft(r.id, "taxPeriod", e.target.value)}
                            className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={r.applicationScope}
                            onChange={(e) => updateDeductionDraft(r.id, "applicationScope", e.target.value)}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          >
                            <option value="annual">annual</option>
                            <option value="monthly">monthly</option>
                            <option value="transaction">transaction</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void saveDeductionRow(r)}
                            disabled={savingDeductionId === r.id || !r.id.startsWith("new-")}
                            className="rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-emerald-200 disabled:opacity-50"
                          >
                            {savingDeductionId === r.id ? "Saving..." : r.id.startsWith("new-") ? "Save" : "Saved"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-slate-400">
                  {loadingDeductions ? "Loading rows..." : `${deductionDraftRows.length} deduction(s). Say **no deductions** in chat to skip.`}
                </div>
                {deductionError && <div className="mt-1 text-[11px] text-rose-300">{deductionError}</div>}
              </div>
            )}
          </div>
        )}
        {session.state === "income_capture" && (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {INCOME_QUICK_ADDS.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  disabled={sending}
                  onClick={() => setInput(template.text)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-emerald-600 disabled:opacity-50"
                >
                  {template.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowIncomeEditor((v) => !v)}
                className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1 text-xs text-sky-200 hover:border-sky-500"
              >
                {showIncomeEditor ? "Hide income table" : "Open income table"}
              </button>
              <button
                type="button"
                onClick={addIncomeDraftRow}
                className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-500"
              >
                Add row
              </button>
            </div>
            {showIncomeEditor && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 overflow-x-auto">
                <table className="min-w-[980px] w-full text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left">Payer</th>
                      <th className="px-2 py-1 text-left">Country</th>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Gross</th>
                      <th className="px-2 py-1 text-left">Currency</th>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Period</th>
                      <th className="px-2 py-1 text-left">Nature</th>
                      <th className="px-2 py-1 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeDraftRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="px-2 py-1">
                          <input
                            value={r.payerName}
                            onChange={(e) => updateIncomeDraft(r.id, "payerName", e.target.value)}
                            className="w-44 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.originCountry}
                            onChange={(e) => updateIncomeDraft(r.id, "originCountry", e.target.value)}
                            className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.incomeType}
                            onChange={(e) => updateIncomeDraft(r.id, "incomeType", e.target.value)}
                            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.grossAmount}
                            onChange={(e) => updateIncomeDraft(r.id, "grossAmount", e.target.value)}
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.originalCurrency}
                            onChange={(e) => updateIncomeDraft(r.id, "originalCurrency", e.target.value)}
                            className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="date"
                            value={r.paymentDate}
                            onChange={(e) => updateIncomeDraft(r.id, "paymentDate", e.target.value)}
                            className="w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={r.periodicity}
                            onChange={(e) => updateIncomeDraft(r.id, "periodicity", e.target.value)}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          >
                            <option value="monthly">monthly</option>
                            <option value="annual">annual</option>
                            <option value="one_off">one_off</option>
                            <option value="recurring">recurring</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={r.nature}
                            onChange={(e) => updateIncomeDraft(r.id, "nature", e.target.value)}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                          >
                            <option value="work">work</option>
                            <option value="investment">investment</option>
                            <option value="retirement">retirement</option>
                            <option value="asset">asset</option>
                            <option value="corporate">corporate</option>
                            <option value="trust">trust</option>
                            <option value="other">other</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void saveIncomeRow(r)}
                            disabled={savingIncomeId === r.id}
                            className="mr-2 rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-emerald-200"
                          >
                            {savingIncomeId === r.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteIncomeRow(r)}
                            disabled={savingIncomeId === r.id}
                            className="rounded border border-rose-700 bg-rose-950 px-2 py-1 text-rose-200"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-slate-400">
                  {loadingIncomes ? "Loading rows..." : `${incomeDraftRows.length} row(s) in this table.`}
                </div>
                {incomeError && <div className="mt-1 text-[11px] text-rose-300">{incomeError}</div>}
              </div>
            )}
          </div>
        )}
        <div className="mb-2 text-xs text-slate-400">
          {sending
            ? "Saving your message..."
            : lastSavedAt
              ? `Saved automatically at ${lastSavedAt}${lastSavedSnippet ? ` · "${lastSavedSnippet}"` : ""}`
              : "Messages are saved automatically."}
        </div>
        <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
          placeholder="Type your answer…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
        />
        <button
          type="button"
          disabled={sending}
          onClick={() => void send()}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
        </div>
      </footer>
      </div>
    </div>
  );
}
