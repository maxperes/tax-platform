import OpenAI from "openai";
import {
  CONVERSATION_STATES,
  type ConversationState
} from "@tax-platform/shared";
import { config } from "../config.js";
import {
  allowedToolsForState,
  type LlmToolName
} from "./orchestrator/machine-state.js";

const incomeNatureEnum = [
  "work",
  "investment",
  "retirement",
  "asset",
  "corporate",
  "trust",
  "other"
] as const;

const incomePeriodicityEnum = ["monthly", "annual", "one_off", "recurring"] as const;

const dataOriginEnum = [
  "manual",
  "upload",
  "spreadsheet",
  "api",
  "bank",
  "broker",
  "tax_api"
] as const;

const incomeSourceProperties = {
  payerName: { type: "string", minLength: 1 },
  originCountry: { type: "string", minLength: 2, description: "2-letter ISO country code" },
  incomeType: { type: "string", minLength: 1 },
  grossAmount: { type: "number", minimum: 0 },
  originalCurrency: { type: "string", minLength: 3, maxLength: 3 },
  paymentDate: {
    type: "string",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    description: "YYYY-MM-DD"
  },
  periodicity: { type: "string", enum: [...incomePeriodicityEnum] },
  nature: { type: "string", enum: [...incomeNatureEnum] },
  taxPaidOriginCountry: { type: "number", minimum: 0 },
  withholdingTax: { type: "number", minimum: 0 },
  hasProofDocument: { type: "boolean" },
  destinationAccountHint: { type: "string" },
  transferredToBrazil: { type: "boolean" },
  remainedAbroad: { type: "boolean" },
  notes: { type: "string" },
  exchangeRateToBrl: { type: "number", exclusiveMinimum: 0 },
  grossAmountBrl: { type: "number", minimum: 0 }
} as const;

const deductionProperties = {
  deductionType: { type: "string", minLength: 1 },
  relatedIncomeId: { type: "string", format: "uuid" },
  relatedEventId: { type: "string", format: "uuid" },
  relatedAssetId: { type: "string", format: "uuid" },
  amount: { type: "number", minimum: 0 },
  currency: { type: "string", minLength: 3, maxLength: 3 },
  exchangeRate: { type: "number", exclusiveMinimum: 0 },
  amountBrl: { type: "number", minimum: 0 },
  taxPeriod: { type: "string", minLength: 1 },
  applicationScope: { type: "string", enum: ["monthly", "annual", "transaction"] },
  isRecurring: { type: "boolean" },
  isEligible: { type: "boolean" },
  requiresProof: { type: "boolean" },
  proofDocumentUrl: { type: "string", format: "uri" },
  notes: { type: "string" },
  dataOrigin: { type: "string", enum: [...dataOriginEnum] }
} as const;

const capitalGainProperties = {
  assetId: { type: "string", format: "uuid" },
  taxEventId: { type: "string", format: "uuid" },
  assetType: { type: "string", minLength: 1 },
  assetCountry: { type: "string", minLength: 2 },
  acquisitionDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  acquisitionValue: { type: "number", minimum: 0 },
  acquisitionCurrency: { type: "string", minLength: 3, maxLength: 3 },
  saleDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  saleValue: { type: "number", minimum: 0 },
  saleCurrency: { type: "string", minLength: 3, maxLength: 3 },
  ownershipPercentageSold: { type: "number", minimum: 0, maximum: 100 },
  deductibleExpenses: { type: "number", minimum: 0 },
  foreignTaxPaid: { type: "number", minimum: 0 },
  exchangeRateAcquisition: { type: "number", exclusiveMinimum: 0 },
  exchangeRateSale: { type: "number", exclusiveMinimum: 0 },
  dataOrigin: { type: "string", enum: [...dataOriginEnum] }
} as const;

const fiscalResidenceDataProperties = {
  fullName: { type: "string", minLength: 1 },
  email: { type: "string", format: "email" },
  nationalityCountry: { type: "string", minLength: 2 },
  currentResidenceCountry: { type: "string", minLength: 2 },
  birthDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  primaryCurrency: { type: "string", minLength: 3, maxLength: 3 },
  isFiscalResidentBrazil: { type: "boolean" },
  isFiscalResidentUSA: { type: "boolean" },
  fiscalResidenceOtherCountry: { type: "boolean" },
  physicallyLivesInBrazil: { type: "boolean" },
  daysInBrazilCalendarYear: { type: "integer", minimum: 0, maximum: 366 },
  daysInUSACalendarYear: { type: "integer", minimum: 0, maximum: 366 },
  firstEntryBrazilDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  immigrationStatus: {
    type: "string",
    enum: [
      "tourist",
      "temporary_visa",
      "digital_nomad",
      "work_visa",
      "retirement_visa",
      "family_reunion",
      "permanent",
      "citizen",
      "none"
    ]
  },
  hasCpf: { type: "boolean" },
  hasResidencePermit: { type: "boolean" },
  intendsToRemain: { type: "string", enum: ["yes", "temporarily", "no"] },
  lastFilingCountry: { type: "string", minLength: 2 },
  filedBrazilianReturn: { type: "boolean" },
  maritalStatus: {
    type: "string",
    enum: ["single", "married", "stable_union", "divorced", "widowed"]
  },
  dependentsCount: { type: "integer", minimum: 0, maximum: 30 },
  hasUSCitizenship: { type: "boolean" },
  hasGreenCard: { type: "boolean" },
  hasUSWorkVisa: { type: "boolean" },
  hasPermanentAddressBrazil: { type: "boolean" },
  hasPermanentAddressUSA: { type: "boolean" },
  hasDependentsBrazilOrAbroad: { type: "boolean" },
  declaredPermanentExitBrazil: { type: "boolean" },
  fiscalResidenceBrazilStartDate: { type: "string" },
  fiscalResidenceBrazilEndDate: { type: "string" }
} as const;

const allToolsByName: Record<LlmToolName, OpenAI.Chat.ChatCompletionTool> = {
  submit_fiscal_residence: {
    type: "function",
    function: {
      name: "submit_fiscal_residence",
      description:
        "Submit or update fiscal residence answers (partial allowed). On every user reply in fiscal_residence, call this with all RF-001 fields collected so far merged into `data` (use knownAnswers as the base and add the latest answer).",
      parameters: {
        type: "object",
        properties: {
          data: {
            type: "object",
            description: "Flat RF-001 key-value fields. Partial updates allowed.",
            properties: fiscalResidenceDataProperties,
            additionalProperties: true
          }
        },
        required: ["data"],
        additionalProperties: false
      }
    }
  },
  submit_income_source: {
    type: "function",
    function: {
      name: "submit_income_source",
      description:
        "Add one income row (RF-002). Required: payerName, originCountry, incomeType, grossAmount, originalCurrency, paymentDate, periodicity, nature.",
      parameters: {
        type: "object",
        properties: {
          income: {
            type: "object",
            properties: incomeSourceProperties,
            required: [
              "payerName",
              "originCountry",
              "incomeType",
              "grossAmount",
              "originalCurrency",
              "paymentDate",
              "periodicity",
              "nature"
            ],
            additionalProperties: false
          }
        },
        required: ["income"],
        additionalProperties: false
      }
    }
  },
  submit_deduction: {
    type: "function",
    function: {
      name: "submit_deduction",
      description: "Add one deduction (RF-006).",
      parameters: {
        type: "object",
        properties: {
          deduction: {
            type: "object",
            properties: deductionProperties,
            required: ["deductionType", "amount", "currency", "taxPeriod", "applicationScope"],
            additionalProperties: false
          }
        },
        required: ["deduction"],
        additionalProperties: false
      }
    }
  },
  submit_capital_gain: {
    type: "function",
    function: {
      name: "submit_capital_gain",
      description: "Add one capital gain calculation input (RF-011).",
      parameters: {
        type: "object",
        properties: {
          capitalGain: {
            type: "object",
            properties: capitalGainProperties,
            required: [
              "assetType",
              "assetCountry",
              "acquisitionDate",
              "acquisitionValue",
              "acquisitionCurrency",
              "saleDate",
              "saleValue",
              "saleCurrency",
              "ownershipPercentageSold"
            ],
            additionalProperties: false
          }
        },
        required: ["capitalGain"],
        additionalProperties: false
      }
    }
  },
  mark_complex_case: {
    type: "function",
    function: {
      name: "mark_complex_case",
      description: "Mark session as requiring human review.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
        additionalProperties: false
      }
    }
  },
  request_clarification: {
    type: "function",
    function: {
      name: "request_clarification",
      description: "Ask the user a follow-up question when the answer is unclear.",
      parameters: {
        type: "object",
        properties: { question: { type: "string", minLength: 1 } },
        required: ["question"],
        additionalProperties: false
      }
    }
  },
  advance_conversation_state: {
    type: "function",
    function: {
      name: "advance_conversation_state",
      description: "Move to the next major step when the current step is complete.",
      parameters: {
        type: "object",
        properties: {
          nextState: {
            type: "string",
            enum: [...CONVERSATION_STATES]
          }
        },
        required: ["nextState"],
        additionalProperties: false
      }
    }
  }
};

export function toolsForConversationState(
  state: ConversationState
): OpenAI.Chat.ChatCompletionTool[] {
  return allowedToolsForState(state).map((name) => allToolsByName[name]);
}

let sharedClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!sharedClient) {
    const apiKey =
      config.openaiApiKey || (config.openaiBaseUrl ? "local-llm" : "");
    sharedClient = new OpenAI({
      apiKey,
      baseURL: config.openaiBaseUrl || undefined,
      timeout: config.llmTimeoutMs,
      maxRetries: 1
    });
  }
  return sharedClient;
}

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type LlmStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_done"; name: string };

function completionToResult(completion: OpenAI.Chat.ChatCompletion): {
  content: string;
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
  assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam;
} {
  const msg = completion.choices[0]?.message;
  const toolCalls = (msg?.tool_calls ?? []) as OpenAI.Chat.ChatCompletionMessageToolCall[];
  const content = msg?.content ?? "";
  const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
    role: "assistant",
    content: content || null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
  return { content, toolCalls, assistantMessage };
}

async function createCompletion(params: {
  messages: ChatMessage[];
  tools: OpenAI.Chat.ChatCompletionTool[];
  onEvent?: (ev: LlmStreamEvent) => void;
}): Promise<{
  content: string;
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
  assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam;
}> {
  const { withLlmAdmission, withLlmTimeout } = await import("./llm-admission.js");
  return withLlmAdmission(async () => {
    const client = getOpenAIClient();
    if (!params.onEvent) {
      const completion = await withLlmTimeout(
        client.chat.completions.create({
          model: config.openaiModel,
          messages: params.messages,
          tools: params.tools,
          tool_choice: "auto",
          max_tokens: config.llmMaxTokens
        }),
        "chat.completions"
      );
      return completionToResult(completion);
    }

    const stream = await withLlmTimeout(
      client.chat.completions.create({
        model: config.openaiModel,
        messages: params.messages,
        tools: params.tools,
        tool_choice: "auto",
        max_tokens: config.llmMaxTokens,
        stream: true
      }),
      "chat.completions.stream"
    );

    let content = "";
    const toolAcc = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        content += delta.content;
        params.onEvent({ type: "delta", text: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: "", name: "", arguments: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) {
            cur.name = tc.function.name;
            params.onEvent({ type: "tool_start", name: tc.function.name });
          }
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
    }

    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [...toolAcc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => ({
        id: t.id || `call_${t.name}`,
        type: "function" as const,
        function: { name: t.name, arguments: t.arguments || "{}" }
      }));

    for (const tc of toolCalls) {
      params.onEvent({ type: "tool_done", name: tc.function.name });
    }

    const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    };
    return { content, toolCalls, assistantMessage };
  });
}

export async function runAssistantWithTools(input: {
  systemPrompt: string;
  userMessages: { role: "user" | "assistant" | "system"; content: string }[];
  conversationState?: ConversationState;
  onEvent?: (ev: LlmStreamEvent) => void;
}): Promise<{
  content: string;
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
  assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam;
}> {
  if (!config.llmEnabled) {
    return {
      content: "",
      toolCalls: [],
      assistantMessage: { role: "assistant", content: "" }
    };
  }
  const tools = input.conversationState
    ? toolsForConversationState(input.conversationState)
    : Object.values(allToolsByName);
  return createCompletion({
    messages: [{ role: "system", content: input.systemPrompt }, ...input.userMessages],
    tools,
    onEvent: input.onEvent
  });
}

/** Recovery turn after tool failures: model sees tool results and may retry. */
export async function runAssistantToolRecovery(input: {
  systemPrompt: string;
  userMessages: { role: "user" | "assistant" | "system"; content: string }[];
  assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam;
  toolResults: { toolCallId: string; content: string }[];
  conversationState?: ConversationState;
  onEvent?: (ev: LlmStreamEvent) => void;
}): Promise<{
  content: string;
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}> {
  if (!config.llmEnabled) {
    return { content: "", toolCalls: [] };
  }
  const tools = input.conversationState
    ? toolsForConversationState(input.conversationState)
    : Object.values(allToolsByName);
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.userMessages,
    input.assistantMessage,
    ...input.toolResults.map(
      (r): OpenAI.Chat.ChatCompletionToolMessageParam => ({
        role: "tool",
        tool_call_id: r.toolCallId,
        content: r.content
      })
    )
  ];
  const result = await createCompletion({
    messages,
    tools,
    onEvent: input.onEvent
  });
  return { content: result.content, toolCalls: result.toolCalls };
}

export async function rewriteSafeResponse(input: {
  userMessage: string;
  deterministicAnswer: string;
}): Promise<string> {
  if (!config.llmEnabled) return input.deterministicAnswer;
  const { withLlmAdmission, withLlmTimeout } = await import("./llm-admission.js");
  try {
    return await withLlmAdmission(async () => {
      const client = getOpenAIClient();
      const completion = await withLlmTimeout(
        client.chat.completions.create({
          model: config.openaiModel,
          temperature: 0.2,
          max_tokens: Math.min(1024, config.llmMaxTokens),
          messages: [
            {
              role: "system",
              content:
                "You rewrite policy-safe customer support responses. Keep all facts unchanged. Do not add new facts, promises, links, legal claims, or numbers. Keep concise, clear, and natural. Preserve the call-to-action at the end."
            },
            {
              role: "user",
              content:
                `User question:\n${input.userMessage}\n\nDeterministic response to rewrite (facts cannot change):\n${input.deterministicAnswer}`
            }
          ]
        }),
        "rewriteSafeResponse"
      );
      return completion.choices[0]?.message?.content?.trim() || input.deterministicAnswer;
    });
  } catch {
    return input.deterministicAnswer;
  }
}

