import {
  ASSET_OPTIONS,
  COUNTRY_OPTIONS,
  INCOME_OPTIONS,
  YES_NO_UNSURE,
} from "./options";
import type { StepDef } from "./types";

export const STEPS: StepDef[] = [
  {
    id: "personal_profile",
    title: "Personal profile",
    intro:
      "Basic context about you. Use approximate or invented details — this demo does not need your real data.",
    questions: [
      {
        id: "citizenship",
        label: "Country of citizenship",
        type: "select",
        options: COUNTRY_OPTIONS,
        required: true,
      },
      {
        id: "residence_country",
        label: "Current country of residence",
        help: "Where you actually live today, regardless of your tax status.",
        type: "select",
        options: COUNTRY_OPTIONS,
        required: true,
      },
      {
        id: "date_of_birth",
        label: "Date of birth",
        help: "Age affects how some retirement income is treated.",
        type: "date",
      },
      {
        id: "marital_status",
        label: "Marital status",
        type: "radio",
        options: [
          { value: "single", label: "Single" },
          { value: "married", label: "Married" },
          {
            value: "stable_union",
            label: "Stable union / civil partnership (união estável)",
          },
          { value: "divorced", label: "Divorced" },
          { value: "widowed", label: "Widowed" },
        ],
        allowNotSure: true,
      },
      {
        id: "dependents",
        label: "How many people do you claim as dependents for tax purposes?",
        help: "Children, a spouse, or others you claim. Enter 0 if none.",
        type: "number",
        placeholder: "0",
      },
    ],
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
        required: true,
      },
      {
        id: "brazil_stays",
        label: "Brazil entry and exit dates",
        help:
          "List every time you were in Brazil in the last couple of years. One stay per row.",
        type: "stays",
        required: true,
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
          { value: "none", label: "No Brazilian status" },
        ],
        allowNotSure: true,
      },
      {
        id: "has_cpf",
        label: "Do you have a Brazilian tax ID (CPF)?",
        help: "We only ask whether you have one. Never enter the number itself.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
    ],
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
        options: [
          ...COUNTRY_OPTIONS,
          { value: "none", label: "I did not file anywhere" },
        ],
        allowNotSure: true,
      },
      {
        id: "filed_brazilian_return",
        label: "Have you ever filed a Brazilian tax return?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "filed_departure_declaration",
        label:
          "Have you filed a Brazilian permanent exit declaration (saída definitiva)?",
        help: "Relevant mainly for people who previously lived in Brazil and left.",
        type: "radio",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_applicable", label: "Not applicable" },
        ],
        allowNotSure: true,
      },
      {
        id: "dual_residency_risk",
        label: "Could more than one country treat you as a tax resident?",
        help: "For example Brazil and the country where you live, or Brazil and the United States.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
    ],
  },
  {
    id: "income_sources",
    title: "Income sources",
    intro: "Select every category you received in the period, from any country.",
    questions: [
      {
        id: "income_types",
        label: "Which kinds of income did you receive?",
        help: "Select all that apply.",
        type: "multiselect",
        options: INCOME_OPTIONS,
        required: true,
      },
    ],
  },
  {
    id: "assets",
    title: "Assets",
    intro: "Select every category you hold, in Brazil or abroad.",
    questions: [
      {
        id: "asset_types",
        label: "Which kinds of assets do you hold?",
        help: "Select all that apply, including companies and trusts if you own them.",
        type: "multiselect",
        options: ASSET_OPTIONS,
        required: true,
      },
    ],
  },
  {
    id: "taxes_documentation",
    title: "Taxes and documentation",
    intro:
      "What you have already paid abroad, and whether you still need to gather paperwork.",
    questions: [
      {
        id: "paid_foreign_tax",
        label: "Did any country outside Brazil take tax from your income?",
        help: "Include tax an employer, bank, or broker already took out before you were paid.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "missing_documents",
        label: "Do you still need to gather tax or bank paperwork?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, several items" },
          { value: "some", label: "A few items" },
          { value: "no", label: "No, I have everything" },
        ],
        allowNotSure: true,
      },
    ],
  },
];

export const ALL_QUESTIONS = STEPS.flatMap((step) => step.questions);

export function questionById(id: string) {
  return ALL_QUESTIONS.find((question) => question.id === id);
}
