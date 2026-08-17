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
          { value: "stable_union", label: "Stable union" },
          { value: "divorced", label: "Divorced" },
          { value: "widowed", label: "Widowed" }
        ],
        allowNotSure: true
      },
      {
        id: "dependents",
        label: "Number of dependents",
        type: "number",
        placeholder: "0"
      }
    ]
  },
  {
    id: "brazil_immigration",
    title: "Brazil immigration",
    intro: "How and when you have been present in Brazil. Days of presence and immigration status both matter.",
    questions: [
      {
        id: "currently_in_brazil",
        label: "Are you currently in Brazil?",
        type: "radio",
        options: YES_NO_UNSURE,
        required: true
      },
      {
        id: "first_entry_date",
        label: "Date of first entry into Brazil",
        help: "The earliest arrival you want this file to consider. Leave blank if you have not entered Brazil.",
        type: "date",
        allowNotSure: true
      },
      {
        id: "brazil_trip_count",
        label: "How many separate stays in Brazil should we record?",
        help: "Each stay is one entry and one exit. Record every period in Brazil that might fall in a rolling twelve-month window. If you are still in Brazil, leave the last exit blank.",
        type: "select",
        options: [
          { value: "1", label: "One stay" },
          { value: "2", label: "Two stays" },
          { value: "3", label: "Three stays" },
          { value: "4", label: "Four stays" },
          { value: "5", label: "Five stays" }
        ],
        allowNotSure: true
      },
      {
        id: "immigration_status",
        label: "Type of immigration status",
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
        label: "Do you have a CPF?",
        help: "We only ask whether you have one. Never enter the number itself.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "has_residence_permit",
        label: "Do you have a Brazilian residence permit?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "intends_to_remain",
        label: "Do you intend to remain in Brazil?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, indefinitely" },
          { value: "temporarily", label: "Yes, for a defined period" },
          { value: "no", label: "No" }
        ],
        allowNotSure: true
      },
      {
        id: "days_in_brazil",
        label: "Approximately how many days did you spend in Brazil?",
        help: "A twelve-month estimate. When you record stay dates, those dates drive the 183-day test; this band is a fallback.",
        type: "select",
        options: [
          { value: "0_30", label: "Fewer than 30 days" },
          { value: "31_90", label: "31 to 90 days" },
          { value: "91_182", label: "91 to 182 days" },
          { value: "183_plus", label: "183 days or more" }
        ],
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
        label: "Have you filed a Brazilian departure declaration?",
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
        id: "self_assessed_residency",
        label: "Do you consider yourself a tax resident of another country?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "dual_residency_risk",
        label: "Could more than one country consider you a tax resident?",
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
        label: "Income sources",
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
        label: "Asset categories",
        help: "Select all that apply.",
        type: "multiselect",
        options: ASSET_OPTIONS,
        required: true
      }
    ]
  },
  {
    id: "taxes_documentation",
    title: "Taxes and documentation",
    intro: "What you have already paid abroad, and what paperwork you can lay your hands on.",
    questions: [
      {
        id: "paid_foreign_tax",
        label: "Did you pay income tax outside Brazil?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "foreign_tax_withheld",
        label: "Was foreign tax withheld at source?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "has_foreign_returns",
        label: "Do you have tax returns from another country?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "has_statements",
        label: "Do you have bank and investment statements?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "has_retirement_statements",
        label: "Do you have retirement income statements?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_applicable", label: "Not applicable" }
        ],
        allowNotSure: true
      },
      {
        id: "owns_entities",
        label: "Do you own foreign companies or trusts?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true
      },
      {
        id: "missing_documents",
        label: "Are any documents missing?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, several" },
          { value: "some", label: "A few" },
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

export function brazilPresenceStep(
  tripCount?: string,
  currentlyInBrazil?: string
): StepDef | null {
  const count = Number(tripCount);
  if (!Number.isInteger(count) || count < 1 || count > 5) return null;
  const lastExitOptional = currentlyInBrazil === "yes";
  const questions: StepDef["questions"] = [];
  for (let index = 1; index <= count; index += 1) {
    const isLast = index === count;
    questions.push({
      id: `brazil_trip_${index}_entry`,
      label: `Stay ${index}: date you entered Brazil`,
      type: "date",
      required: true
    });
    questions.push({
      id: `brazil_trip_${index}_exit`,
      label: `Stay ${index}: date you left Brazil`,
      help:
        isLast && lastExitOptional
          ? "Leave blank if this stay is still ongoing."
          : "Last day you were in Brazil on this stay.",
      type: "date",
      required: !(isLast && lastExitOptional),
      allowNotSure: true
    });
  }
  return {
    id: "brazil_presence",
    title: "Brazil presence",
    intro:
      "Entry and exit dates for each stay. The 183-day residency test uses a rolling twelve-month window, not a calendar year.",
    questions
  };
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
        label: `Tax already withheld on ${option.label.toLowerCase()}`,
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

export function stepsForInterview(
  selectedIncome: string[],
  extras: {
    tripCount?: string;
    currentlyInBrazil?: string;
    assetTypes?: string[];
  } = {}
): StepDef[] {
  const steps = [...STEPS];
  const presence = brazilPresenceStep(extras.tripCount, extras.currentlyInBrazil);
  if (presence) {
    const idx = steps.findIndex((step) => step.id === "tax_residency");
    if (idx >= 0) steps.splice(idx, 0, presence);
  }
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

