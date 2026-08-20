import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionBanner } from "../components/chat/ActionBanner";
import { ChatInput } from "../components/chat/ChatInput";
import { ChatSessionHeader } from "../components/chat/ChatSessionHeader";
import { ChatWorkspacePanel, hasChatWorkspaceContent } from "../components/chat/ChatWorkspacePanel";
import { DomainModuleEditor } from "../components/chat/DomainModuleEditor";
import { DeductionEditor, type DeductionRow } from "../components/chat/DeductionEditor";
import { IncomeEditor, type IncomeRow } from "../components/chat/IncomeEditor";
import { MessageList } from "../components/chat/MessageList";
import { SessionErrorView } from "../components/chat/SessionErrorView";
import { TriageChips } from "../components/chat/TriageChips";
import {
  NOTICE_RULES_OUTDATED,
  activeSessionNotices,
  loadNoticeReadIds,
  saveNoticeReadIds
} from "../lib/chat-notices";
import { WHY_HINT_BY_STATE, formatCalcStatus, stepLabelForState, stepProgress } from "../lib/chat-constants";
import { formatMoney } from "../lib/chat-utils";
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
  const [syncingMap, setSyncingMap] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const [streamingText, setStreamingText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [incomeDraftRows, setIncomeDraftRows] = useState<IncomeRow[]>([]);
  const [savingIncomeId, setSavingIncomeId] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [deductionDraftRows, setDeductionDraftRows] = useState<DeductionRow[]>([]);
  const [savingDeductionId, setSavingDeductionId] = useState("");
  const [deductionError, setDeductionError] = useState("");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [navigatingStep, setNavigatingStep] = useState(false);
  const [noticeCenterOpen, setNoticeCenterOpen] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(() => new Set());
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
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
    staleTime: 0
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
    setChatError(null);
    setActionError(null);
    setSending(false);
    setResetting(false);
    setMobileWorkspaceOpen(false);
    if (sessionId) {
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
      if (rulesFreshness?.isRulesOutdated) applicable.add(NOTICE_RULES_OUTDATED.id);
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
  }, [sessionId, session?.messages.length, session?.requiresAdditionalReview, rulesFreshness?.isRulesOutdated]);

  useEffect(() => {
    if (!noticeCenterOpen || !sessionId || !session) return;
    const ids = activeSessionNotices(session).map((n) => n.id);
    if (rulesFreshness?.isRulesOutdated) ids.push(NOTICE_RULES_OUTDATED.id);
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
  }, [noticeCenterOpen, sessionId, session, rulesFreshness?.isRulesOutdated]);

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
      await qc.invalidateQueries({ queryKey: ["incomes", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["deductions", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["taxReportLatest", sessionId, session.taxYear] });
      await qc.invalidateQueries({ queryKey: ["taxReportFull"] });
      setOptimisticMessages([]);
      setStreamingText("");
      setLastSavedAt(new Date().toLocaleTimeString());
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

  async function openTaxMap() {
    if (!sessionId) return;
    setActionError(null);
    setSyncingMap(true);
    try {
      const result = await api<{ twinId: string }>(`/api/sessions/${sessionId}/sync-to-twin`, {
        method: "POST",
        body: JSON.stringify({})
      });
      if (!result?.twinId) {
        throw new Error("Could not open your tax map.");
      }
      // Full navigation: App remounts <Routes> on every pathname, which can drop useNavigate().
      window.location.assign(`/impact/${result.twinId}/map`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not build your tax map.");
      setSyncingMap(false);
    }
  }

  const inReportPhase = session?.state === "complete" || session?.state === "report";
  const showResultsSummary = inReportPhase && Boolean(fullReport);
  const showMapCta = Boolean(session);
  const mapButtonClass =
    "inline-flex items-center rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:bg-accent-light/80 disabled:opacity-50";

  function prefetchReport(reportId: string) {
    void qc.prefetchQuery({
      queryKey: taxReportQueryKey(reportId),
      queryFn: () => fetchTaxReport(reportId),
      staleTime: 60_000
    });
  }

  function reportActionButtons(reportId: string) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncingMap}
          onClick={() => void openTaxMap()}
          className={mapButtonClass}
        >
          {syncingMap ? "Building map…" : "View 360° tax map"}
        </button>
        <a
          href={`/report/${reportId}`}
          onMouseEnter={() => prefetchReport(reportId)}
          className="inline-flex items-center rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:bg-accent-light/80 no-underline"
        >
          View filing report
        </a>
        <button
          type="button"
          onClick={() => void downloadLatestReportJson()}
          className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
        >
          Download JSON
        </button>
      </div>
    );
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
      await qc.invalidateQueries({ queryKey: ["taxReportLatest", sessionId, session.taxYear] });
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
  const sessionNotices = [
    ...activeSessionNotices(session),
    ...(rulesFreshness?.isRulesOutdated
      ? [
          {
            id: NOTICE_RULES_OUTDATED.id,
            title: NOTICE_RULES_OUTDATED.title,
            body: NOTICE_RULES_OUTDATED.body,
            kind: "rules" as const
          }
        ]
      : [])
  ];
  const showTriageChips = session.state === "fiscal_residence" && session.messages.length <= 1;
  const busy = sending || resetting || navigatingStep || syncingMap;
  const workspaceTitle =
    session.state === "complete" || session.state === "report"
      ? "Report"
      : stepLabelForState(session.state);

  const resultsBlock = (
    <>
      {showResultsSummary && fullReport && (
        <div className="space-y-3 rounded-md border border-surface-border bg-white px-4 py-4 text-sm text-navy">
          <p className="font-medium text-navy">Results summary</p>
          {fullReport.summaryJson.annualTaxEstimates?.map((est, i) => (
            <p key={i} className="text-xs text-navy-700">
              <strong className="text-navy">{est.jurisdiction}</strong>: net due {formatMoney(est.netTaxDue, est.currency)} (
              {formatCalcStatus(est.calculationStatus)})
            </p>
          ))}
          {latestReportMeta && reportActionButtons(latestReportMeta.id)}
        </div>
      )}
      {session.state === "report" && !latestReportMeta && (
        <div className="rounded-md border border-surface-border bg-white px-4 py-4">
          <button
            type="button"
            disabled={sending}
            onClick={() => send("generate the report")}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            Generate report
          </button>
        </div>
      )}
      {session.state === "complete" && !(fullReport && latestReportMeta) && (
        <div className="space-y-2 rounded-md border border-surface-border bg-white px-4 py-4 text-xs text-navy">
          {latestReportMeta ? (
            reportActionButtons(latestReportMeta.id)
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={syncingMap} onClick={() => void openTaxMap()} className={mapButtonClass}>
                {syncingMap ? "Building map…" : "View 360° tax map"}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => send("generate the report")}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                Generate filing report
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  const hasResultsBlock = Boolean(
    (showResultsSummary && fullReport) ||
      (session.state === "report" && !latestReportMeta) ||
      (session.state === "complete" && !(fullReport && latestReportMeta))
  );

  const showWorkspace = hasChatWorkspaceContent({
    sessionState: session.state,
    hasResultsBlock
  });

  const workspaceEditors = (
    <>
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
          sending={sending}
          onAddRow={addIncomeDraftRow}
          onUpdate={updateIncomeDraft}
          onSave={(r) => void saveIncomeRow(r)}
          onDelete={(r) => void deleteIncomeRow(r)}
          onQuickAdd={setInput}
        />
      )}
    </>
  );

  const workspaceButtonLabel = workspaceTitle;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-muted">
      <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col bg-white 2xl:max-w-[96rem]">
        <ChatSessionHeader
          taxYear={session.taxYear}
          stepLabel={stepLabelForState(session.state)}
          currentState={session.state}
          progressIndex={progress.index}
          progressTotal={progress.total}
          jumpDisabled={busy}
          onJump={(s) => void jumpToStep(s)}
          notices={sessionNotices}
          noticeCenterOpen={noticeCenterOpen}
          readNoticeIds={readNoticeIds}
          noticeCenterRef={noticeCenterRef}
          onToggleNotices={() => setNoticeCenterOpen((o) => !o)}
          showMapCta={showMapCta}
          syncingMap={syncingMap}
          onOpenMap={() => void openTaxMap()}
          resetting={resetting}
          onStartOver={() => void startOver()}
          onSignOut={handleSignOut}
        />

        <div className="relative flex min-h-0 flex-1">
        <div
          className={`flex min-h-0 min-w-0 flex-col bg-white ${
            showWorkspace ? "w-full lg:w-[42%] xl:w-[40%]" : "w-full px-4 sm:px-8 lg:px-12"
          }`}
        >
          <MessageList
            messages={displayedMessages}
            assistantTyping={assistantTyping}
            typingDots={typingDots}
            streamingText={streamingText}
            chatError={chatError}
            onRetry={lastFailedMessage ? () => void sendMessage(lastFailedMessage) : undefined}
          />

          {actionError && (
            <div className="shrink-0 px-4 pb-2 sm:px-5 lg:px-6">
              <ActionBanner message={actionError} onDismiss={() => setActionError(null)} />
            </div>
          )}

          {(showTriageChips || showWorkspace) && (
            <div
              className={`shrink-0 border-t border-surface-border px-4 py-2 sm:px-5 lg:px-6 ${
                showTriageChips ? "" : "lg:hidden"
              }`}
            >
              <TriageChips visible={showTriageChips} disabled={sending} onSelect={(id) => setInput(id)} />
              {showWorkspace && (
                <button
                  type="button"
                  onClick={() => setMobileWorkspaceOpen(true)}
                  className="mb-1 w-full rounded-md border border-accent/40 bg-accent-light px-3 py-2 text-xs font-semibold text-accent-dark hover:bg-accent-light/80 lg:hidden"
                >
                  {workspaceButtonLabel}
                </button>
              )}
            </div>
          )}

          <ChatInput
            input={input}
            sending={sending}
            lastSavedAt={lastSavedAt}
            hint={showWorkspace ? undefined : whyHint}
            onInputChange={setInput}
            onSend={() => send()}
          />
        </div>

        {showWorkspace && (
          <>
            {mobileWorkspaceOpen && (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-navy/40 lg:hidden"
                aria-label="Dismiss details"
                onClick={() => setMobileWorkspaceOpen(false)}
              />
            )}
            <aside
              className={
                mobileWorkspaceOpen
                  ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] min-h-[50vh] flex-col overflow-hidden rounded-t-xl border-t border-surface-border bg-white shadow-card lg:static lg:z-auto lg:max-h-none lg:min-h-0 lg:w-[58%] lg:flex-1 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none xl:w-[60%]"
                  : "hidden min-h-0 border-l border-surface-border bg-white lg:flex lg:w-[58%] lg:flex-1 lg:flex-col xl:w-[60%]"
              }
              role={mobileWorkspaceOpen ? "dialog" : undefined}
              aria-modal={mobileWorkspaceOpen ? true : undefined}
              aria-label={mobileWorkspaceOpen ? workspaceTitle : undefined}
            >
              <ChatWorkspacePanel
                title={workspaceTitle}
                description={whyHint}
                onClose={mobileWorkspaceOpen ? () => setMobileWorkspaceOpen(false) : undefined}
                resultsBlock={resultsBlock}
              >
                {workspaceEditors}
              </ChatWorkspacePanel>
            </aside>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
