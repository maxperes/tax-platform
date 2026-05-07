import OpenAI from "openai";
import { config } from "../config.js";

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "submit_fiscal_residence",
      description:
        "Submit or update fiscal residence answers (partial allowed). On every user reply in fiscal_residence, you MUST call this with **all** RF-001 fields collected so far merged into `data` (use Context so far as the base and add the latest answer). Never send only the newest field—otherwise earlier answers are lost server-side.",
      parameters: {
        type: "object",
        properties: {
          data: {
            type: "object",
            description:
              "Flat key-value fields matching RF-001 (nationalityCountry, currentResidenceCountry, birthDate, primaryCurrency, isFiscalResidentBrazil, isFiscalResidentUSA, fiscalResidenceOtherCountry, fullName, email, …). You may nest under `fiscalResidence` only if you also merge every known value into that object."
          }
        },
        required: ["data"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_income_source",
      description:
        "Add one income row (RF-002). Required in `income`: payerName, originCountry (2-letter ISO), incomeType, grossAmount (number), originalCurrency (3-letter ISO), paymentDate (YYYY-MM-DD), periodicity (monthly | annual | one_off | recurring), nature (work | investment | retirement | asset | corporate | trust | other). For monthly salary use periodicity monthly and grossAmount = monthly gross.",
      parameters: {
        type: "object",
        properties: {
          income: { type: "object" }
        },
        required: ["income"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_deduction",
      description: "Add one deduction (RF-006).",
      parameters: {
        type: "object",
        properties: {
          deduction: { type: "object" }
        },
        required: ["deduction"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_capital_gain",
      description: "Add one capital gain calculation input (RF-011).",
      parameters: {
        type: "object",
        properties: {
          capitalGain: { type: "object" }
        },
        required: ["capitalGain"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mark_complex_case",
      description: "Mark session as requiring human review.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_clarification",
      description: "Ask the user a follow-up question when the answer is unclear.",
      parameters: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "advance_conversation_state",
      description: "Move to the next major step when the current step is complete.",
      parameters: {
        type: "object",
        properties: {
          nextState: {
            type: "string",
            enum: [
              "fiscal_residence",
              "income_capture",
              "events",
              "deductions",
              "capital_gain",
              "monthly_calc",
              "report",
              "complete"
            ]
          }
        },
        required: ["nextState"]
      }
    }
  }
];

function createOpenAIClient(): OpenAI {
  const apiKey =
    config.openaiApiKey || (config.openaiBaseUrl ? "local-llm" : "");
  return new OpenAI({
    apiKey,
    baseURL: config.openaiBaseUrl || undefined
  });
}

export async function runAssistantWithTools(input: {
  systemPrompt: string;
  userMessages: { role: "user" | "assistant" | "system"; content: string }[];
}): Promise<{
  content: string;
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}> {
  if (!config.llmEnabled) {
    return { content: "", toolCalls: [] };
  }
  const client = createOpenAIClient();
  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [{ role: "system", content: input.systemPrompt }, ...input.userMessages],
    tools,
    tool_choice: "auto"
  });
  const msg = completion.choices[0]?.message;
  const toolCalls = msg?.tool_calls ?? [];
  const content = msg?.content ?? "";
  return { content, toolCalls: toolCalls as OpenAI.Chat.ChatCompletionMessageToolCall[] };
}

export async function streamAssistantReply(input: {
  systemPrompt: string;
  userMessages: { role: "user" | "assistant" | "system"; content: string }[];
  onDelta: (text: string) => void;
}): Promise<void> {
  if (!config.llmEnabled) {
    input.onDelta("");
    return;
  }
  const client = createOpenAIClient();
  const stream = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [{ role: "system", content: input.systemPrompt }, ...input.userMessages],
    stream: true
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) input.onDelta(delta);
  }
}

export async function rewriteSafeResponse(input: {
  userMessage: string;
  deterministicAnswer: string;
}): Promise<string> {
  if (!config.llmEnabled) return input.deterministicAnswer;
  const client = createOpenAIClient();
  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    temperature: 0.2,
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
  });
  return completion.choices[0]?.message?.content?.trim() || input.deterministicAnswer;
}
