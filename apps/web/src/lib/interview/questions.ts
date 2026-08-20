import { ASSET_OPTIONS, COUNTRY_OPTIONS, INCOME_OPTIONS, YES_NO_UNSURE } from "./options";
import type { StepDef } from "./types";

export const STEPS: StepDef[] = [
  {
    id: "personal_profile",
    title: "Personal profile",
    intro: "Basic context about you. Approximate answers are enough at this stage.",
    questions: [
      {
        id: "citizenship",
        label: "Country of citizenship",
        type: "select",
        options: COUNTRY_OPTIONS,
        required: true
      },
      {
        id: "residence_country",
        label: "Current country of residence",
        help: "Where you actually live today, regardless of your tax status.",
        type: "select",
        options: COUNTRY_OPTIONS,
        required: true
      },
      {
        id: "full_name",
        label: "Your name",
        help: "Used only to label this file. You can use a first name.",
        type: "text",
        placeholder: "First and last name"
      },
      {
        id: "date_of_birth",
        label: "Date of birth",
        help: "Age affects how some retirement income is treated.",
        type: "date"
      },
      {
        id: "marital_status",
        label: "Marital status",
        type: "radio",
        options: [
          { value: "single", label: "Single" },
          { value: "married", label: "Married" },
          { value: "stable_union", label: "Stable union / civil partnership (união estável)" },
          { value: "divorced", label: "Divorced" },
          { value: "widowed", label: "Widowed" }
        ],
        allowNotSure: true
      },
      {
        id: "dependents",
        label: "How many people do you claim as dependents for tax purposes?",
        help: "Children, a spouse, or others you claim. Enter 0 if none.",
        type: "number",
        placeholder: "0"
      }
    ]
  },
  {
    id: "brazil_immigration",
    title: "Brazil immigration",
    intro:
      "Record when you entered and left Brazil. The system counts days of presence — you do not need to estimate totals yourself.",
    questions: [
      {
        id: "currently_in_brazil",
        label: "Are you currently in Brazil?",
        type: "radio",
        options: YES_NO_UNSURE,
        required: true
      },
      {
        id: "brazil_stays",
        label: "Brazil entry and exit dates",
        help:
          "List every time you were in Brazil in the last couple of years. One stay per row. If you are still in Brazil, leave the last exit blank.",
        type: "stays",
        required: true
      },
      {
        id: "immigration_status",
        label: "What is your Brazilian immigration status?",
        type: "select",
        options: [
          { value: "tourist", label: "Tourist or visitor" },
          { value: "temporary_visa", label: "Temporary visa" },
          { value: "digital_nomad", label: "Digital nomad visa" },
          { value: "work_visa", label: "Work visa" },
          { value: "retirement_visa", label: "Retirement visa" },
          { value: "family_reunion", label: "Family reunion" },
          { value: "permanent", label: "Permanent residence" },
          { value: "citizen", label: "Brazilian citizen" },
          { value: "none", label: "No Brazilian status" }
        ],
        allowNotSure: true
      },
      {
        id: "has_cpf",
        label: "Do you have a Brazilian tax ID (CPF)?",
        help: "We only ask whether you have one. Never enter the number itself.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      }
    ]
  },
  {
    id: "tax_residency",
    title: "Tax residency",
    intro:
      "Where you have filed and where you might be treated as resident. More than one country can claim you at the same time.",
    questions: [
      {
        id: "last_filing_country",
        label: "Where did you file a tax return last year?",
        type: "select",
        options: [...COUNTRY_OPTIONS, { value: "none", label: "I did not file anywhere" }],
        allowNotSure: true
      },
      {
        id: "filed_brazilian_return",
        label: "Have you ever filed a Brazilian tax return?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "filed_departure_declaration",
        label: "Have you filed a Brazilian permanent exit declaration (saída definitiva)?",
        help: "Relevant mainly for people who previously lived in Brazil and left.",
        type: "radio",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_applicable", label: "Not applicable" }
        ],
        allowNotSure: true
      },
      {
        id: "dual_residency_risk",
        label: "Could more than one country treat you as a tax resident?",
        help: "For example Brazil and the country where you live, or Brazil and the United States.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      }
    ]
  },
  {
    id: "income_sources",
    title: "Income sources",
    intro: "Select every category you received in the period, from any country.",
    questions: [
      {
        id: "income_types",
        label: "Which kinds of income did you receive?",
        help: "Select all that apply. The next step asks only about the ones you choose.",
        type: "multiselect",
        options: INCOME_OPTIONS,
        required: true
      }
    ]
  },
  {
    id: "assets",
    title: "Assets",
    intro: "Select every category you hold. The next step asks which country each category belongs to.",
    questions: [
      {
        id: "asset_types",
        label: "Which kinds of assets do you hold?",
        help: "Select all that apply, including companies and trusts if you own them.",
        type: "multiselect",
        options: ASSET_OPTIONS,
        required: true
      }
    ]
  },
  {
    id: "taxes_documentation",
    title: "Taxes and documentation",
    intro: "What you have already paid abroad, and whether you still need to gather paperwork.",
    questions: [
      {
        id: "paid_foreign_tax",
        label: "Did any country outside Brazil take tax from your income?",
        help: "Include tax an employer, bank, or broker already took out before you were paid.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "missing_documents",
        label: "Do you still need to gather tax or bank paperwork?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, several items" },
          { value: "some", label: "A few items" },
          { value: "no", label: "No, I have everything" }
        ],
        allowNotSure: true
      }
    ]
  }
];

export const ALL_QUESTIONS = STEPS.flatMap((step) => step.questions);

export function questionById(id: string) {
  return ALL_QUESTIONS.find((question) => question.id === id);
}

export function incomeDetailStep(selected: string[]): StepDef | null {
  const chosen = INCOME_OPTIONS.filter((option) => selected.includes(option.value));
  if (chosen.length === 0) return null;
  return {
    id: "income_details",
    title: "Income details",
    intro: "Only the categories you selected. Approximate annual amounts are enough.",
    questions: chosen.flatMap((option) => [
      {
        id: `income_${option.value}_amount`,
        label: `Approximate annual ${option.label.toLowerCase()}`,
        help: "Use the original currency. An estimate is better than leaving it blank.",
        type: "number" as const,
        placeholder: "0"
      },
      {
        id: `income_${option.value}_country`,
        label: `Where did this ${option.label.toLowerCase()} come from?`,
        type: "select" as const,
        options: COUNTRY_OPTIONS,
        allowNotSure: true
      },
      {
        id: `income_${option.value}_currency`,
        label: `Currency for ${option.label.toLowerCase()}`,
        type: "select" as const,
        options: [
          { value: "USD", label: "USD" },
          { value: "BRL", label: "BRL" },
          { value: "EUR", label: "EUR" },
          { value: "GBP", label: "GBP" }
        ]
      },
      {
        id: `income_${option.value}_withholding`,
        label: `Tax already taken out on ${option.label.toLowerCase()}`,
        help: "Leave blank if none or you are not sure.",
        type: "number" as const,
        placeholder: "0",
        allowNotSure: true
      },
      {
        id: `income_${option.value}_payment_date`,
        label: `When did you receive this ${option.label.toLowerCase()}?`,
        help: "A payment or credit date. Used to decide whether Brazil can tax the amount after residency starts. Approximate is enough.",
        type: "date" as const,
        allowNotSure: true
      }
    ])
  };
}

export function assetDetailStep(selected: string[]): StepDef | null {
  const chosen = ASSET_OPTIONS.filter((option) => selected.includes(option.value));
  if (chosen.length === 0) return null;
  return {
    id: "asset_details",
    title: "Asset locations",
    intro: "Which country each category is held in. Approximate answers are enough.",
    questions: chosen.map((option) => ({
      id: `asset_${option.value}_country`,
      label:
        option.value === "brazilian_companies"
          ? "Country for Brazilian company interests"
          : `Country where you hold ${option.label.toLowerCase()}`,
      help:
        option.value === "brazilian_companies"
          ? "Usually Brazil. Change this only if the company is formed elsewhere."
          : undefined,
      type: "select" as const,
      options: COUNTRY_OPTIONS,
      required: true,
      allowNotSure: true
    }))
  };
}

/** Immigration statuses that usually mean a Brazilian residence permit is held. */
export const IMMIGRATION_IMPLIES_PERMIT = new Set([
  "temporary_visa",
  "digital_nomad",
  "work_visa",
  "retirement_visa",
  "family_reunion",
  "permanent",
  "citizen"
]);

export function stepsForInterview(
  selectedIncome: string[],
  extras: {
    assetTypes?: string[];
    lastFilingCountry?: string;
  } = {}
): StepDef[] {
  const steps = STEPS.map((step) => {
    if (step.id !== "tax_residency") return step;
    if (extras.lastFilingCountry !== "br") return step;
    return {
      ...step,
      questions: step.questions.filter((question) => question.id !== "filed_brazilian_return")
    };
  });
  const income = incomeDetailStep(selectedIncome);
  if (income) {
    const idx = steps.findIndex((step) => step.id === "assets");
    if (idx >= 0) steps.splice(idx, 0, income);
  }
  const assets = assetDetailStep(extras.assetTypes ?? []);
  if (assets) {
    const idx = steps.findIndex((step) => step.id === "taxes_documentation");
    if (idx >= 0) steps.splice(idx, 0, assets);
  }
  return steps;
}
