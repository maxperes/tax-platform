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
          { value: "stable_union", label: "Stable union" },
          { value: "divorced", label: "Divorced" },
          { value: "widowed", label: "Widowed" },
        ],
        allowNotSure: true,
      },
      {
        id: "dependents",
        label: "Number of dependents",
        type: "number",
        placeholder: "0",
      },
    ],
  },
  {
    id: "brazil_immigration",
    title: "Brazil immigration",
    intro:
      "How and when you have been present in Brazil. Days of presence and immigration status both matter.",
    questions: [
      {
        id: "currently_in_brazil",
        label: "Are you currently in Brazil?",
        type: "radio",
        options: YES_NO_UNSURE,
        required: true,
      },
      {
        id: "first_entry_date",
        label: "Date of first entry during the relevant year",
        help: "Leave blank if you did not enter Brazil that year.",
        type: "date",
        allowNotSure: true,
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
          { value: "none", label: "No Brazilian status" },
        ],
        allowNotSure: true,
      },
      {
        id: "has_cpf",
        label: "Do you have a CPF?",
        help: "We only ask whether you have one. Never enter the number itself.",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "has_residence_permit",
        label: "Do you have a Brazilian residence permit?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "intends_to_remain",
        label: "Do you intend to remain in Brazil?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, indefinitely" },
          { value: "temporarily", label: "Yes, for a defined period" },
          { value: "no", label: "No" },
        ],
        allowNotSure: true,
      },
      {
        id: "days_in_brazil",
        label: "Approximately how many days did you spend in Brazil?",
        help: "An estimate over the last twelve months is enough.",
        type: "select",
        options: [
          { value: "0_30", label: "Fewer than 30 days" },
          { value: "31_90", label: "31 to 90 days" },
          { value: "91_182", label: "91 to 182 days" },
          { value: "183_plus", label: "183 days or more" },
        ],
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
        label: "Have you filed a Brazilian departure declaration?",
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
        id: "self_assessed_residency",
        label: "Do you consider yourself a tax resident of another country?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "dual_residency_risk",
        label: "Could more than one country consider you a tax resident?",
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
        label: "Income sources",
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
        label: "Asset categories",
        help: "Select all that apply.",
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
      "What you have already paid abroad, and what paperwork you can lay your hands on.",
    questions: [
      {
        id: "paid_foreign_tax",
        label: "Did you pay income tax outside Brazil?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "foreign_tax_withheld",
        label: "Was foreign tax withheld at source?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "has_foreign_returns",
        label: "Do you have tax returns from another country?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "has_statements",
        label: "Do you have bank and investment statements?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "has_retirement_statements",
        label: "Do you have retirement income statements?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_applicable", label: "Not applicable" },
        ],
        allowNotSure: true,
      },
      {
        id: "owns_entities",
        label: "Do you own foreign companies or trusts?",
        type: "radio",
        options: YES_NO_UNSURE,
        allowNotSure: true,
      },
      {
        id: "missing_documents",
        label: "Are any documents missing?",
        type: "radio",
        options: [
          { value: "yes", label: "Yes, several" },
          { value: "some", label: "A few" },
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
