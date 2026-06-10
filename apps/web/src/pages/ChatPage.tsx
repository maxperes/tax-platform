import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionBanner } from "../components/chat/ActionBanner";
import { ChatInput } from "../components/chat/ChatInput";
import { DomainModuleEditor } from "../components/chat/DomainModuleEditor";
import { DeductionEditor, type DeductionRow } from "../components/chat/DeductionEditor";
import { IncomeEditor, type IncomeRow } from "../components/chat/IncomeEditor";
import { MessageList } from "../components/chat/MessageList";
import { NotificationCenter } from "../components/chat/NotificationCenter";
import { SessionErrorView } from "../components/chat/SessionErrorView";
import { StepPills } from "../components/chat/StepPills";
import { TriageChips } from "../components/chat/TriageChips";
import {
  NOTICE_ADDITIONAL_REVIEW,
  NOTICE_WELCOME_BACK,
  NOTICE_RULES_OUTDATED,
  activeSessionNotices,
  loadNoticeReadIds,
  reviewBannerStorageKey,
  rulesFreshnessBannerStorageKey,
  saveNoticeReadIds,
  welcomeBannerStorageKey
} from "../lib/chat-notices";
import { WHY_HINT_BY_STATE, formatCalcStatus, stepLabelForState, stepProgress } from "../lib/chat-constants";
import { formatMoney, renderChatEmphasis } from "../lib/chat-utils";
import { api, downloadAuthenticated, getToken, signOut, streamSessionMessage } from "../api";
import { fetchTaxReport, taxReportQueryKey } from "../lib/tax-report";

type Message = { id: string; role: string; content: string; createdAt: string };

type Session = {
  id: string;
  taxYear: number;
  state: string;
  requiresAdditionalReview: boolean;
  messages: Message[];
};

export function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const [streamingText, setStreamingText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [lastSavedSnippet, setLastSavedSnippet] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [showIncomeEditor, setShowIncomeEditor] = useState(false);
  const [incomeDraftRows, setIncomeDraftRows] = useState<IncomeRow[]>([]);
  const [savingIncomeId, setSavingIncomeId] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [showDeductionEditor, setShowDeductionEditor] = useState(false);
  const [deductionDraftRows, setDeductionDraftRows] = useState<DeductionRow[]>([]);
  const [savingDeductionId, setSavingDeductionId] = useState("");
  const [deductionError, setDeductionError] = useState("");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [navigatingStep, setNavigatingStep] = useState(false);
  const [hideWelcomeBanner, setHideWelcomeBanner] = useState(false);
  const [hideReviewBanner, setHideReviewBanner] = useState(false);
  const [hideRulesBanner, setHideRulesBanner] = useState(false);
  const [noticeCenterOpen, setNoticeCenterOpen] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(() => new Set());
  const noticeCenterRef = useRef<HTMLDivElement>(null);

  const {
    data: session,
    isLoading,
    isError,
    error: sessionError,
    refetch: refetchSession
  } = useQuery({
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
      return rows.map((r) => ({ ...r, amount: String(r.amount) }));
    },
    enabled: Boolean(sessionId && session?.state === "deductions")
  });

  type LatestReportMeta = { id: string; taxYear: number; title: string; createdAt: string; ruleVersion?: string };
  const { data: latestReportMeta } = useQuery({
    queryKey: ["taxReportLatest", sessionId, session?.taxYear],
    queryFn: async (): Promise<LatestReportMeta | null> => {
      const token = getToken();
      const res = await fetch(`/api/report/latest?taxYear=${session!.taxYear}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as LatestReportMeta;
    },
    enabled: Boolean(sessionId && session && (session.state === "complete" || session.state === "report")),
    staleTime: 15_000
  });

  type RulesFreshness = {
    isRulesOutdated: boolean;
    currentRuleVersion: string;
    outdatedSources: string[];
  };
  const { data: rulesFreshness } = useQuery({
    queryKey: ["rulesFreshness", sessionId, session?.taxYear],
    queryFn: async (): Promise<RulesFreshness> => {
      return api<RulesFreshness>(`/api/tax-rules/freshness?taxYear=${session!.taxYear}`);
    },
    enabled: Boolean(sessionId && session?.taxYear),
    staleTime: 30_000
  });

  const reportId = latestReportMeta?.id;

  const { data: fullReport } = useQuery({
    queryKey: reportId ? taxReportQueryKey(reportId) : ["taxReportFull", "none"],
    queryFn: () => fetchTaxReport(reportId!),
    enabled: Boolean(reportId),
    staleTime: 15_000
  });

  useEffect(() => {
    if (session?.messages?.length || optimisticMessages.length || streamingText) {
      document.getElementById("chat-end")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.messages, optimisticMessages, assistantTyping, typingDots, streamingText]);

  useEffect(() => {
    if (!assistantTyping) return;
    const id = window.setInterval(() => {
      setTypingDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 350);
    return () => window.clearInterval(id);
  }, [assistantTyping]);

  useEffect(() => {
    setInput("");
    setOptimisticMessages([]);
    setAssistantTyping(false);
    setStreamingText("");
    setTypingDots(".");
    setLastSavedAt("");
    setLastSavedSnippet("");
    setChatError(null);
    setActionError(null);
    setSending(false);
    setResetting(false);
    if (sessionId) {
      setHideWelcomeBanner(localStorage.getItem(welcomeBannerStorageKey(sessionId)) === "1");
      setHideReviewBanner(localStorage.getItem(reviewBannerStorageKey(sessionId)) === "1");
      setHideRulesBanner(localStorage.getItem(rulesFreshnessBannerStorageKey(sessionId)) === "1");
      setReadNoticeIds(loadNoticeReadIds(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    setIncomeDraftRows(incomeRows);
  }, [incomeRows]);

  useEffect(() => {
    setDeductionDraftRows(deductionRows);
  }, [deductionRows]);

  useEffect(() => {
    if (!sessionId || !session?.requiresAdditionalReview) return;
    localStorage.removeItem(reviewBannerStorageKey(sessionId));
    setHideReviewBanner(false);
  }, [sessionId, session?.requiresAdditionalReview]);

  useEffect(() => {
    if (!noticeCenterOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (noticeCenterRef.current && !noticeCenterRef.current.contains(e.target as Node)) {
        setNoticeCenterOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNoticeCenterOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [noticeCenterOpen]);

  useEffect(() => {
    if (!sessionId || !session) return;
    setReadNoticeIds((prev) => {
      const applicable = new Set(activeSessionNotices(session).map((n) => n.id));
      const next = new Set<string>();
      let pruned = false;
      for (const id of prev) {
        if (applicable.has(id)) next.add(id);
        else pruned = true;
      }
      if (!pruned && next.size === prev.size) return prev;
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
      if (!added) return prev;
      saveNoticeReadIds(sessionId, next);
      return next;
    });
  }, [noticeCenterOpen, sessionId, session]);

  async function sendMessage(userText: string) {
    if (!sessionId || !session || !userText.trim()) return;
    setChatError(null);
    setLastFailedMessage(null);
    const optimisticUserMessage: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString()
    };
    setOptimisticMessages((prev) => [...prev, optimisticUserMessage]);
    setAssistantTyping(true);
    setStreamingText("");
    setSending(true);

    try {
      let usedStream = false;
      try {
        await streamSessionMessage(sessionId, userText, (delta) => {
          usedStream = true;
          setAssistantTyping(false);
          setStreamingText((prev) => prev + delta);
        });
      } catch {
        if (usedStream) throw new Error("Stream interrupted");
        await api<{ assistantText: string; sessionState: string }>(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: userText })
        });
      }
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
      await qc.invalidateQueries({ queryKey: ["taxReportLatest", sessionId, session.taxYear] });
      setOptimisticMessages([]);
      setStreamingText("");
      setLastSavedAt(new Date().toLocaleTimeString());
      setLastSavedSnippet(userText.slice(0, 72));
    } catch (err) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
      setStreamingText("");
      setLastFailedMessage(userText);
      setChatError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setAssistantTyping(false);
      setSending(false);
    }
  }

  function send(prefilledText?: string) {
    const userText = (prefilledText ?? input).trim();
    if (!userText) return;
    setInput("");
    void sendMessage(userText);
  }

  async function downloadLatestReportJson() {
    if (!latestReportMeta) return;
    setActionError(null);
    try {
      await downloadAuthenticated(
        `/api/report/${latestReportMeta.id}/download`,
        `tax-report-${latestReportMeta.taxYear}.json`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not download the report.");
    }
  }

  const headerActionClass =
    "inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-600 no-underline";

  function prefetchReport(reportId: string) {
    void qc.prefetchQuery({
      queryKey: taxReportQueryKey(reportId),
      queryFn: () => fetchTaxReport(reportId),
      staleTime: 60_000
    });
  }

  async function startOver() {
    if (!session) return;
    if (!window.confirm("Start over and create a new blank chat session?")) return;
    setActionError(null);
    setResetting(true);
    try {
      const next = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ taxYear: session.taxYear })
      });
      window.location.assign(`/chat/${next.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start a new session");
    } finally {
      setResetting(false);
    }
  }

  function handleSignOut() {
    signOut();
    window.location.assign("/login");
  }

  async function jumpToStep(state: string) {
    if (!sessionId || !session || state === session.state) return;
    setNavigatingStep(true);
    setActionError(null);
    try {
      await api(`/api/sessions/${sessionId}/advance`, {
        method: "POST",
        body: JSON.stringify({ state })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not move to selected step");
    } finally {
      setNavigatingStep(false);
    }
  }

  function updateIncomeDraft(id: string, key: keyof IncomeRow, value: string) {
    setIncomeDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addIncomeDraftRow() {
    if (!session) return;
    setShowIncomeEditor(true);
    setIncomeDraftRows((prev) => [
      {
        id: `new-${Date.now()}`,
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
        await api("/api/incomes", { method: "POST", body: JSON.stringify({ taxYear: session.taxYear, income: payload }) });
      } else {
        await api(`/api/incomes/${row.id}`, { method: "PUT", body: JSON.stringify({ taxYear: session.taxYear, income: payload }) });
      }
      await qc.invalidateQueries({ queryKey: ["incomes", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setIncomeError(err instanceof Error ? err.message : "Could not save income row");
    } finally {
      setSavingIncomeId("");
    }
  }

  async function deleteIncomeRow(row: IncomeRow) {
    if (!session) return;
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

  function updateDeductionDraft(id: string, key: keyof DeductionRow, value: string) {
    setDeductionDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addDeductionDraftRow() {
    if (!session) return;
    setShowDeductionEditor(true);
    setDeductionDraftRows((prev) => [
      {
        id: `new-${Date.now()}`,
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
    if (!session || !row.id.startsWith("new-")) return;
    setSavingDeductionId(row.id);
    setDeductionError("");
    try {
      await api("/api/deductions", {
        method: "POST",
        body: JSON.stringify({
          taxYear: session.taxYear,
          deduction: {
            deductionType: row.deductionType.trim(),
            amount: Number(row.amount),
            currency: row.currency.trim().toUpperCase(),
            taxPeriod: row.taxPeriod.trim(),
            applicationScope: row.applicationScope
          }
        })
      });
      await qc.invalidateQueries({ queryKey: ["deductions", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDeductionError(err instanceof Error ? err.message : "Could not save deduction row");
    } finally {
      setSavingDeductionId("");
    }
  }

  async function saveDomainAsset(row: {
    name: string;
    assetType: string;
    country: string;
    acquisitionDate: string;
    acquisitionValue: string;
    acquisitionCurrency: string;
  }) {
    if (!session) return;
    setDomainSaving(true);
    setDomainError("");
    try {
      await api("/api/assets", {
        method: "POST",
        body: JSON.stringify({
          taxYear: session.taxYear,
          asset: {
            name: row.name.trim(),
            assetType: row.assetType.trim(),
            country: row.country.trim().toUpperCase(),
            acquisitionDate: row.acquisitionDate,
            acquisitionValue: Number(row.acquisitionValue),
            acquisitionCurrency: row.acquisitionCurrency.trim().toUpperCase()
          }
        })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Could not save asset");
    } finally {
      setDomainSaving(false);
    }
  }

  async function saveDomainTransfer(row: {
    fromCountry: string;
    toCountry: string;
    amount: string;
    currency: string;
    transferDate: string;
    classification: string;
  }) {
    if (!session) return;
    setDomainSaving(true);
    setDomainError("");
    try {
      await api("/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          taxYear: session.taxYear,
          transfer: {
            fromCountry: row.fromCountry.trim().toUpperCase(),
            toCountry: row.toCountry.trim().toUpperCase(),
            amount: Number(row.amount),
            currency: row.currency.trim().toUpperCase(),
            transferDate: row.transferDate,
            classification: row.classification
          }
        })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Could not save transfer");
    } finally {
      setDomainSaving(false);
    }
  }

  async function saveDomainTrust(row: { name: string; jurisdiction: string; trustType: string }) {
    if (!session) return;
    setDomainSaving(true);
    setDomainError("");
    try {
      await api("/api/trusts", {
        method: "POST",
        body: JSON.stringify({
          taxYear: session.taxYear,
          trust: {
            name: row.name.trim(),
            jurisdiction: row.jurisdiction.trim().toUpperCase(),
            trustType: row.trustType
          }
        })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Could not save trust");
    } finally {
      setDomainSaving(false);
    }
  }

  async function saveDomainEntitySim(row: {
    scenarioName: string;
    proLaborePercent: string;
    profitDistributionPercent: string;
    estimatedEffectiveTaxRate: string;
    grossIncomeBrl: string;
  }) {
    if (!session) return;
    setDomainSaving(true);
    setDomainError("");
    try {
      await api("/api/entity-simulations", {
        method: "POST",
        body: JSON.stringify({
          taxYear: session.taxYear,
          grossIncomeBrl: Number(row.grossIncomeBrl),
          simulation: {
            scenarioName: row.scenarioName.trim(),
            proLaborePercent: Number(row.proLaborePercent),
            profitDistributionPercent: Number(row.profitDistributionPercent),
            estimatedOperatingCosts: 0,
            estimatedEffectiveTaxRate: Number(row.estimatedEffectiveTaxRate),
            entityCountry: "BR"
          }
        })
      });
      await qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Could not run simulation");
    } finally {
      setDomainSaving(false);
    }
  }

  if (isLoading || isError || !session) {
    return (
      <SessionErrorView
        isLoading={isLoading}
        isError={isError || !session}
        errorMessage={sessionError instanceof Error ? sessionError.message : undefined}
        onRetry={() => void refetchSession()}
      />
    );
  }

  const displayedMessages = [...session.messages, ...optimisticMessages];
  const progress = stepProgress(session.state);
  const whyHint = WHY_HINT_BY_STATE[session.state] ?? "We will keep this short and one question at a time.";
  const sessionNotices = activeSessionNotices(session);
  const showTriageChips = session.state === "fiscal_residence" && session.messages.length <= 1;
  const busy = sending || resetting || navigatingStep;

  return (
    <div className="h-screen overflow-hidden max-w-3xl mx-auto p-2 sm:p-4">
      <div className="h-full flex flex-col rounded-xl border border-slate-800 bg-slate-950/40">
        <header className="relative border-b border-slate-800 px-3 sm:px-4 py-3 sm:py-4 max-h-[45vh] overflow-y-auto chat-scrollbar">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg sm:text-xl font-semibold">Tax intake</h1>
            <div ref={noticeCenterRef} className="flex flex-wrap items-center justify-end gap-2">
              <NotificationCenter
                open={noticeCenterOpen}
                notices={sessionNotices}
                readIds={readNoticeIds}
                onToggle={() => setNoticeCenterOpen((o) => !o)}
                containerRef={noticeCenterRef}
              />
              <a href="/sessions" className={headerActionClass}>
                Sessions
              </a>
              <a href="/privacy" className={headerActionClass}>
                Privacy
              </a>
              <button type="button" onClick={handleSignOut} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-600">
                Sign out
              </button>
              <button type="button" onClick={() => void startOver()} disabled={resetting} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-600 disabled:opacity-50">
                {resetting ? "Starting over..." : "Start over"}
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Year {session.taxYear} · Step <span className="text-emerald-400">{stepLabelForState(session.state)}</span> ·{" "}
            {progress.index}/{progress.total}
          </p>
          <p className="mt-2 text-xs text-slate-400">{whyHint}</p>
          <StepPills currentState={session.state} progressIndex={progress.index} disabled={busy} onJump={(s) => void jumpToStep(s)} />
          {actionError && <ActionBanner message={actionError} onDismiss={() => setActionError(null)} />}
          {session.messages.length > 1 && !hideWelcomeBanner && (
            <div className="mt-3 rounded-lg border border-sky-800/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-100 flex gap-3 items-start justify-between">
              <p className="min-w-0 flex-1">{NOTICE_WELCOME_BACK.body}</p>
              <button type="button" onClick={() => { if (sessionId) localStorage.setItem(welcomeBannerStorageKey(sessionId), "1"); setHideWelcomeBanner(true); }} className="shrink-0 rounded border border-sky-700/60 px-2 py-0.5 text-[11px]">
                Hide
              </button>
            </div>
          )}
          {session.requiresAdditionalReview && !hideReviewBanner && (
            <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 flex gap-3 items-start justify-between" role="status">
              <p className="min-w-0 flex-1">{renderChatEmphasis(NOTICE_ADDITIONAL_REVIEW.body)}</p>
              <button type="button" onClick={() => { if (sessionId) localStorage.setItem(reviewBannerStorageKey(sessionId), "1"); setHideReviewBanner(true); }} className="shrink-0 rounded border border-amber-700/60 px-2 py-0.5 text-[11px]">
                Hide
              </button>
            </div>
          )}
          {rulesFreshness?.isRulesOutdated && !hideRulesBanner && (
            <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 flex gap-3 items-start justify-between" role="alert">
              <p className="min-w-0 flex-1">
                {renderChatEmphasis(NOTICE_RULES_OUTDATED.body)}
                {rulesFreshness.outdatedSources.length > 0 && (
                  <span className="block mt-1 text-xs text-amber-200/80">
                    Affected: {rulesFreshness.outdatedSources.join(", ")} · current rules: {rulesFreshness.currentRuleVersion}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (sessionId) localStorage.setItem(rulesFreshnessBannerStorageKey(sessionId), "1");
                  setHideRulesBanner(true);
                }}
                className="shrink-0 rounded border border-amber-700/60 px-2 py-0.5 text-[11px]"
              >
                Hide
              </button>
            </div>
          )}
          {(session.state === "complete" || session.state === "report") && fullReport && (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-3 text-xs text-slate-200 space-y-3">
              <p className="text-sm font-medium text-emerald-200">Results summary</p>
              {fullReport.summaryJson.annualTaxEstimates?.map((est, i) => (
                <p key={i}>
                  <strong>{est.jurisdiction}</strong>: net due {formatMoney(est.netTaxDue, est.currency)} ({formatCalcStatus(est.calculationStatus)})
                </p>
              ))}
              {latestReportMeta && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/report/${latestReportMeta.id}`}
                    onMouseEnter={() => prefetchReport(latestReportMeta.id)}
                    className="inline-flex items-center rounded-lg border border-emerald-600/60 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-900/70 no-underline"
                  >
                    View report
                  </a>
                  <button type="button" onClick={() => void downloadLatestReportJson()} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-emerald-600">
                    Download JSON
                  </button>
                </div>
              )}
            </div>
          )}
          {session.state === "report" && !latestReportMeta && (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs">
              <button type="button" disabled={sending} onClick={() => send("generate the report")} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                Generate report
              </button>
            </div>
          )}
          {session.state === "complete" && (
            <div className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100 space-y-2">
              {latestReportMeta ? (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/report/${latestReportMeta.id}`}
                    onMouseEnter={() => prefetchReport(latestReportMeta.id)}
                    className="inline-flex items-center rounded-lg border border-emerald-600/60 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-100 no-underline"
                  >
                    View report
                  </a>
                  <button type="button" onClick={() => void downloadLatestReportJson()} className="rounded-lg border border-emerald-600/60 px-3 py-1.5 text-xs">
                    Download JSON
                  </button>
                </div>
              ) : (
                <button type="button" disabled={sending} onClick={() => send("generate the report")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                  Generate report
                </button>
              )}
            </div>
          )}
        </header>

        <MessageList
          messages={displayedMessages}
          assistantTyping={assistantTyping}
          typingDots={typingDots}
          streamingText={streamingText}
          chatError={chatError}
          onRetry={lastFailedMessage ? () => void sendMessage(lastFailedMessage) : undefined}
        />

        <div className="border-t border-slate-800 px-3 sm:px-4 py-3">
          <TriageChips visible={showTriageChips} disabled={sending} onSelect={(id) => setInput(id)} />
          {["patrimony", "transfers", "trust_registry", "entity_simulation"].includes(session.state) && (
            <DomainModuleEditor
              state={session.state}
              saving={domainSaving}
              error={domainError}
              onSaveAsset={(r) => void saveDomainAsset(r)}
              onSaveTransfer={(r) => void saveDomainTransfer(r)}
              onSaveTrust={(r) => void saveDomainTrust(r)}
              onSaveEntitySim={(r) => void saveDomainEntitySim(r)}
            />
          )}
          {session.state === "deductions" && (
            <DeductionEditor
              rows={deductionDraftRows}
              loading={loadingDeductions}
              savingId={savingDeductionId}
              error={deductionError}
              showEditor={showDeductionEditor}
              onToggleEditor={() => setShowDeductionEditor((v) => !v)}
              onAddRow={addDeductionDraftRow}
              onUpdate={updateDeductionDraft}
              onSave={(r) => void saveDeductionRow(r)}
            />
          )}
          {session.state === "income_capture" && (
            <IncomeEditor
              rows={incomeDraftRows}
              loading={loadingIncomes}
              savingId={savingIncomeId}
              error={incomeError}
              showEditor={showIncomeEditor}
              sending={sending}
              onToggleEditor={() => setShowIncomeEditor((v) => !v)}
              onAddRow={addIncomeDraftRow}
              onUpdate={updateIncomeDraft}
              onSave={(r) => void saveIncomeRow(r)}
              onDelete={(r) => void deleteIncomeRow(r)}
              onQuickAdd={setInput}
            />
          )}
        </div>

        <ChatInput
          input={input}
          sending={sending}
          lastSavedAt={lastSavedAt}
          lastSavedSnippet={lastSavedSnippet}
          onInputChange={setInput}
          onSend={() => send()}
        />
      </div>
    </div>
  );
}
