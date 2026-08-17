import { fiscalResidenceSchema, type ConversationState, type FiscalResidence } from "@tax-platform/shared";
import { deriveFiscalProfile } from "@tax-platform/rules";
import type { Prisma } from "../../prisma-client.js";
import { prisma } from "../../db.js";
import {
  coerceFiscalBooleansInPlace,
  coerceFiscalFieldValue,
  firstFiscalFieldPrompt,
  formatFiscalValidationError,
  getActiveFiscalFieldOrder,
  getFiscalQuestionForContext,
  inferFiscalFieldFromAssistantText,
  isBooleanFiscalField,
  isValidFiscalFieldValue,
  looksLikeFiscalFieldAnswer,
  parseBool,
  prepareFiscalPayloadForValidation
} from "../fiscal-intake.js";
import {
  defaultUsFilingInputs,
  inferredUsFilingStatus,
  isTriagePending,
  triagePromptText,
  usFilingPromptText,
  usFilingStatusLabel
} from "../intake-helpers.js";
export const FISCAL_PROFILE_CONFIRM_PENDING_KEY = "_fiscalProfileConfirmPending";

export function describeFiscalProfileForRecap(raw: string): string {
  const labels: Record<string, string> = {
    resident_brazil: "Brazil fiscal resident (as modeled)",
    non_resident_brazil: "Not a Brazil fiscal resident (as modeled)",
    resident_usa: "United States fiscal resident (as modeled)",
    dual_residence: "Dual residence — Brazil and United States both in scope",
    undetermined: "Residency profile still undetermined from the answers we have"
  };
  return labels[raw] ?? raw.replace(/_/g, " ");
}

export function fiscalProfileSavedLead(input: {
  taxYear: number;
  profile: string;
  requiresAdditionalReview: boolean;
  fullName?: string;
}): string {
  const name = input.fullName?.trim();
  const thanks = name ? `Thanks, **${name}**. ` : "Thanks — ";
  const label = describeFiscalProfileForRecap(input.profile);
  const review = input.requiresAdditionalReview
    ? " Because more than one country may treat you as resident, we will flag this for a specialist — you can still continue."
    : "";
  return `${thanks}Your fiscal profile for **${input.taxYear}** is saved as **${label}**.${review}`;
}

export type FiscalCompleteResult = {
  context: Record<string, unknown>;
  state: ConversationState;
  requiresAdditionalReview: boolean;
};

/** Flatten nested `fiscalResidence` and map common LLM alias keys to RF-001 names. */
const FISCAL_FIELD_ALIASES: Record<string, string> = {
  nationality: "nationalityCountry",
  countryOfNationality: "nationalityCountry",
  country_of_nationality: "nationalityCountry",
  fiscalResidenceCountry: "currentResidenceCountry",
  currentCountry: "currentResidenceCountry",
  residenceCountry: "currentResidenceCountry",
  countryOfResidence: "currentResidenceCountry",
  countryOfFiscalResidence: "currentResidenceCountry",
  dob: "birthDate",
  dateOfBirth: "birthDate",
  date_of_birth: "birthDate",
  currency: "primaryCurrency",
  mainCurrency: "primaryCurrency"
};

function normalizeFiscalAliasKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const [alias, canonical] of Object.entries(FISCAL_FIELD_ALIASES)) {
    const v = out[alias];
    if (v === undefined || v === null || v === "") continue;
    if (out[canonical] === undefined || out[canonical] === null || out[canonical] === "") {
      out[canonical] = v;
    }
    delete out[alias];
  }
  return out;
}

export function expandFiscalResidenceToolPayload(data: Record<string, unknown>): Record<string, unknown> {
  const nested = data.fiscalResidence;
  const rest = { ...data };
  delete rest.fiscalResidence;
  let flat: Record<string, unknown> = rest;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    flat = { ...(nested as Record<string, unknown>), ...flat };
  }
  return normalizeFiscalAliasKeys(flat);
}

/** Flat tool merges + optional nested `fiscalResidence` from prior saves. */
export function getFiscalResidenceMergedFields(context: Record<string, unknown>): Record<string, unknown> {
  const nested = context.fiscalResidence;
  const fromNested =
    nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : {};
  const merged = normalizeFiscalAliasKeys({ ...fromNested, ...context });
  const cr = merged.currentResidenceCountry;
  if (typeof cr === "string" && cr.trim().toLowerCase() === "same") {
    const nat = merged.nationalityCountry;
    if (typeof nat === "string" && nat.trim().length >= 2) {
      merged.currentResidenceCountry = nat.trim().toUpperCase();
    }
  }
  return merged;
}

export function fiscalProfileConfirmPromptText(): string {
  return "Reply **yes** to use this saved profile and continue toward your 360° map, or **no** to replace it and answer the questions again from the start.";
}

export function isFiscalProfileConfirmPending(context: Record<string, unknown>): boolean {
  return context[FISCAL_PROFILE_CONFIRM_PENDING_KEY] === true;
}

function formatFiscalResidenceSummaryForUser(data: FiscalResidence): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  return [
    "**What we have on file**",
    `- **Name:** ${data.fullName}`,
    `- **Email:** ${data.email}`,
    `- **Nationality (ISO):** ${data.nationalityCountry}`,
    `- **Country of residence (ISO):** ${data.currentResidenceCountry}`,
    `- **Date of birth:** ${data.birthDate}`,
    `- **Main currency:** ${data.primaryCurrency}`,
    `- **Fiscal resident of Brazil:** ${yn(data.isFiscalResidentBrazil)}`,
    `- **Fiscal resident of the USA:** ${yn(data.isFiscalResidentUSA)}`,
    `- **Fiscal residence in another country (not BR/US):** ${yn(data.fiscalResidenceOtherCountry)}`
  ].join("\n");
}

/** First assistant message when a validated profile already exists for this user and tax year. */
export function buildAssistantMessageForExistingFiscalProfile(input: {
  taxYear: number;
  data: FiscalResidence;
  derivedProfile: string;
  requiresAdditionalReview: boolean;
}): string {
  const profileLine = describeFiscalProfileForRecap(input.derivedProfile);
  const review = input.requiresAdditionalReview
    ? "\n\n**Note:** this profile is flagged for possible **expert review**."
    : "";
  return (
    `We already have a **fiscal profile on file** for **${input.taxYear}** (modeled as **${profileLine}**).${review}\n\n` +
    `${formatFiscalResidenceSummaryForUser(input.data)}\n\n` +
    fiscalProfileConfirmPromptText()
  );
}

export function isConfirmUseStoredFiscalProfile(text: string): boolean {
  const t = text.trim().toLowerCase();
  const b = parseBool(t);
  if (b === true) return true;
  if (b === false) return false;
  return (
    /^(ok|okay|sure|yep|yeah)\b/.test(t) ||
    /\b(use|keep)\b.*\b(it|profile|saved|this)\b/.test(t) ||
    /\b(it|profile|saved|this)\b.*\b(use|keep)\b/.test(t) ||
    /\b(that|looks?)\s+(is\s+)?(fine|good|correct)\b/.test(t) ||
    /\bsounds?\s+good\b/.test(t)
  );
}

export function isConfirmReplaceFiscalProfile(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (parseBool(t) === false) return true;
  if (parseBool(t) === true) return false;
  return (
    /^no\b/.test(t) ||
    /\b(replace|start\s+over|re-?enter|from\s+scratch|enter\s+again|discard|ignore)\b/.test(t)
  );
}

export function stripFiscalProfileConfirmFlag(context: Record<string, unknown>): Record<string, unknown> {
  const next = { ...context };
  delete next[FISCAL_PROFILE_CONFIRM_PENDING_KEY];
  delete next._triagePending;
  return next;
}

export function getFiscalResidenceCurrentQuestion(context: Record<string, unknown>): string {
  if (isFiscalProfileConfirmPending(context)) {
    return fiscalProfileConfirmPromptText();
  }
  if (isTriagePending(context)) {
    return triagePromptText();
  }
  if (context._usFilingPending === true) {
    return usFilingPromptText(context);
  }
  return getFiscalQuestionForContext(getFiscalResidenceMergedFields(context));
}

/** Field the assistant is currently asking — last asked, else inferred, else first pending. */
export function resolveFiscalFieldBeingAsked(
  context: Record<string, unknown>,
  lastAssistantText?: string
): string | undefined {
  const merged = getFiscalResidenceMergedFields(context);
  const pending = getActiveFiscalFieldOrder(merged).filter(
    (f) => !isValidFiscalFieldValue(f.key, merged[f.key])
  );
  if (pending.length === 0) return undefined;
  const pendingKeys = pending.map((f) => f.key);
  const lastAsked = context._lastAskedKey;
  if (typeof lastAsked === "string" && pendingKeys.includes(lastAsked)) return lastAsked;
  if (lastAssistantText) {
    const inferred = inferFiscalFieldFromAssistantText(lastAssistantText, pendingKeys);
    if (inferred) return inferred;
  }
  return pending[0]!.key;
}

export function getFiscalPromptForAskedField(
  context: Record<string, unknown>,
  lastAssistantText?: string
): string {
  const key = resolveFiscalFieldBeingAsked(context, lastAssistantText);
  const merged = getFiscalResidenceMergedFields(context);
  const def = key ? getActiveFiscalFieldOrder(merged).find((f) => f.key === key) : undefined;
  return def?.prompt ?? getFiscalQuestionForContext(merged);
}

/** If the assistant message asks about a pending fiscal field, persist it as _lastAskedKey. */
export function syncLastAskedKeyFromAssistantText(
  context: Record<string, unknown>,
  assistantText: string
): Record<string, unknown> {
  const merged = getFiscalResidenceMergedFields(context);
  const pendingKeys = getActiveFiscalFieldOrder(merged)
    .filter((f) => !isValidFiscalFieldValue(f.key, merged[f.key]))
    .map((f) => f.key);
  const inferred = inferFiscalFieldFromAssistantText(assistantText, pendingKeys);
  if (!inferred || context._lastAskedKey === inferred) return context;
  return { ...context, _lastAskedKey: inferred };
}

/**
 * Resolve which pending fiscal field the user is answering.
 * Supports LLM-driven question order (e.g. birth date before core yes/no fields).
 */
export function resolveFiscalFieldForUserAnswer(
  context: Record<string, unknown>,
  userContent: string,
  lastAssistantText?: string
): string | undefined {
  const t = userContent.trim();
  if (!t) return undefined;
  const merged = getFiscalResidenceMergedFields(context);
  const pending = getActiveFiscalFieldOrder(merged).filter(
    (f) => !isValidFiscalFieldValue(f.key, merged[f.key])
  );
  if (pending.length === 0) return undefined;

  const pendingKeys = pending.map((f) => f.key);
  const lastAsked = context._lastAskedKey;
  if (
    typeof lastAsked === "string" &&
    pendingKeys.includes(lastAsked) &&
    looksLikeFiscalFieldAnswer(lastAsked, t)
  ) {
    return lastAsked;
  }

  if (lastAssistantText) {
    const fromAssistant = inferFiscalFieldFromAssistantText(lastAssistantText, pendingKeys);
    if (fromAssistant && looksLikeFiscalFieldAnswer(fromAssistant, t)) {
      return fromAssistant;
    }
    const allKeys = getActiveFiscalFieldOrder(merged).map((f) => f.key);
    const asked = inferFiscalFieldFromAssistantText(lastAssistantText, allKeys);
    if (asked && looksLikeFiscalFieldAnswer(asked, t)) {
      return asked;
    }
  }

  const matches = pending.filter((f) => looksLikeFiscalFieldAnswer(f.key, t));
  if (matches.length === 1) return matches[0]!.key;

  const unambiguous = matches.filter((f) => !isBooleanFiscalField(f.key));
  if (unambiguous.length === 1) return unambiguous[0]!.key;

  const firstPending = pending[0]!.key;
  if (looksLikeFiscalFieldAnswer(firstPending, t)) return firstPending;
  return undefined;
}

/**
 * When the LLM omits the user's answer in submit_fiscal_residence, merge the raw message
 * into the matching pending fiscal field.
 */
export function fuseUserMessageIntoFiscalContext(
  context: Record<string, unknown>,
  userContent: string,
  lastAssistantText?: string
): Record<string, unknown> | null {
  if (isFiscalProfileConfirmPending(context)) return null;
  const t = userContent.trim();
  if (!t) return null;
  const fieldKey = resolveFiscalFieldForUserAnswer(context, t, lastAssistantText);
  if (!fieldKey) return null;
  const next = { ...context, [fieldKey]: coerceFiscalFieldValue(fieldKey, t) };
  coerceFiscalBooleansInPlace(next);
  return next;
}

export async function completeFiscalProfileAndDetermineNext(
  userId: string,
  taxYear: number,
  parsed: FiscalResidence,
  existingCtx: Record<string, unknown>
): Promise<FiscalCompleteResult> {
  const profile = deriveFiscalProfile(parsed);
  await prisma.fiscalResidenceProfile.upsert({
    where: { userId_taxYear: { userId, taxYear } },
    create: {
      userId,
      taxYear,
      data: parsed as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    },
    update: {
      data: parsed as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    }
  });
  const ctx: Record<string, unknown> = {
    ...existingCtx,
    incomes: [],
    fiscalResidence: parsed,
    intakeGoal: existingCtx.intakeGoal
  };
  delete ctx._lastAskedKey;
  delete ctx[FISCAL_PROFILE_CONFIRM_PENDING_KEY];
  delete ctx._triagePending;
  delete ctx._assetScreenPending;
  const needsUs = profile.profile === "resident_usa" || profile.profile === "dual_residence";
  if (needsUs && !ctx.usFilingInputs) {
    const inferred = inferredUsFilingStatus(ctx);
    if (inferred) {
      ctx.usFilingInputs = defaultUsFilingInputs(inferred);
      delete ctx._usFilingPending;
      return {
        context: ctx,
        state: "income_capture",
        requiresAdditionalReview: profile.requiresAdditionalReview
      };
    }
    ctx._usFilingPending = true;
    return { context: ctx, state: "fiscal_residence", requiresAdditionalReview: profile.requiresAdditionalReview };
  }
  delete ctx._usFilingPending;
  return { context: ctx, state: "income_capture", requiresAdditionalReview: profile.requiresAdditionalReview };
}

export async function tryCompleteFiscalResidenceFromContext(
  userId: string,
  taxYear: number,
  ctx: Record<string, unknown>
): Promise<FiscalCompleteResult | null> {
  const rawMerged = getFiscalResidenceMergedFields(ctx);
  for (const { key } of getActiveFiscalFieldOrder(rawMerged)) {
    if (!isValidFiscalFieldValue(key, rawMerged[key])) return null;
  }
  const merged = prepareFiscalPayloadForValidation(rawMerged);
  if (typeof merged.email !== "string" || !merged.email) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) merged.email = user.email;
  }
  const parsed = fiscalResidenceSchema.safeParse(merged);
  if (!parsed.success) return null;
  return completeFiscalProfileAndDetermineNext(userId, taxYear, parsed.data, ctx);
}

export async function templateFiscalResidence(
  sessionId: string,
  session: { userId: string; taxYear: number; contextJson: Prisma.JsonValue | null },
  userContent: string,
  lastAssistantText: string | undefined,
  resolveIntakeRedirect: (
    state: ConversationState,
    context: Record<string, unknown>,
    userId: string,
    taxYear: number
  ) => Promise<string>
): Promise<string> {
  const c = { ...(session.contextJson as Record<string, unknown>) ?? {} };
  const mergedBefore = getFiscalResidenceMergedFields(c);
  const order = getActiveFiscalFieldOrder(mergedBefore);
  const fieldKey = resolveFiscalFieldForUserAnswer(c, userContent, lastAssistantText);
  if (!fieldKey) {
    return `${getFiscalQuestionForContext(mergedBefore)}\n\nPlease answer in the format requested above.`;
  }
  c[fieldKey] = coerceFiscalFieldValue(fieldKey, userContent);
  coerceFiscalBooleansInPlace(c);

  const merged = getFiscalResidenceMergedFields(c);
  const nextField = getActiveFiscalFieldOrder(merged).find((f) => !isValidFiscalFieldValue(f.key, merged[f.key]));
  if (nextField) {
    c._lastAskedKey = nextField.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return nextField.prompt;
  }

  const forValidation = prepareFiscalPayloadForValidation(merged);
  if (typeof forValidation.email !== "string" || !forValidation.email) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true }
    });
    if (user?.email) forValidation.email = user.email;
  }
  const parsed = fiscalResidenceSchema.safeParse(forValidation);
  if (!parsed.success) {
    c._lastAskedKey = order[0]!.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return `${formatFiscalValidationError()}\n\n${firstFiscalFieldPrompt()}`;
  }

  const result = await completeFiscalProfileAndDetermineNext(session.userId, session.taxYear, parsed.data, c);
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      state: result.state,
      requiresAdditionalReview: result.requiresAdditionalReview,
      contextJson: result.context as Prisma.InputJsonValue
    }
  });

  const profile = deriveFiscalProfile(parsed.data);
  const tail =
    result.state === "fiscal_residence" && result.context._usFilingPending === true
      ? usFilingPromptText(result.context)
      : await resolveIntakeRedirect("income_capture", result.context, session.userId, session.taxYear);
  const us = result.context.usFilingInputs as { filingStatus?: string } | undefined;
  const inferredNote =
    result.state === "income_capture" && (us?.filingStatus === "single" || us?.filingStatus === "mfj" || us?.filingStatus === "hoh")
      ? `We'll use **${usFilingStatusLabel(us.filingStatus)}** for the US estimate.\n\n`
      : "";
  return `${fiscalProfileSavedLead({
    taxYear: session.taxYear,
    profile: profile.profile,
    requiresAdditionalReview: profile.requiresAdditionalReview,
    fullName: parsed.data.fullName
  })}\n\n${inferredNote}${tail}`;
}
