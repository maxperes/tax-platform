import type { Option } from "./types";

export const COUNTRY_OPTIONS: Option[] = [
  { value: "us", label: "United States" },
  { value: "br", label: "Brazil" },
  { value: "pt", label: "Portugal" },
  { value: "uk", label: "United Kingdom" },
  { value: "ca", label: "Canada" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "it", label: "Italy" },
  { value: "es", label: "Spain" },
  { value: "ar", label: "Argentina" },
  { value: "jp", label: "Japan" },
  { value: "au", label: "Australia" },
  { value: "other", label: "Another country" },
];

export const YES_NO_UNSURE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const INCOME_OPTIONS: Option[] = [
  { value: "salary", label: "Salary", description: "Employment income from any country" },
  { value: "self_employment", label: "Self-employment", description: "Freelance, consulting or professional fees" },
  { value: "social_security", label: "Social Security", description: "Public retirement benefits such as US Social Security" },
  { value: "government_pension", label: "Government pension", description: "Pension from public service or military" },
  { value: "private_pension", label: "Private pension", description: "Employer or personal retirement plans" },
  { value: "dividends", label: "Dividends", description: "Distributions from listed or private companies" },
  { value: "interest", label: "Interest", description: "Bank accounts, bonds and fixed income" },
  { value: "capital_gains", label: "Capital gains", description: "Gains from selling assets" },
  { value: "rental", label: "Rental income", description: "Income from property you own" },
  { value: "business_distributions", label: "Business distributions", description: "Profits taken from a company you own" },
  { value: "stock_options", label: "Stock options", description: "Options granted by an employer" },
  { value: "rsus", label: "RSUs", description: "Restricted stock units" },
  { value: "trust", label: "Trust distributions", description: "Amounts received from a trust" },
  { value: "crypto", label: "Cryptocurrency", description: "Trading, staking or disposal proceeds" },
  { value: "other_income", label: "Other income" },
];

export const ASSET_OPTIONS: Option[] = [
  { value: "bank_accounts", label: "Bank accounts" },
  { value: "brokerage", label: "Brokerage accounts" },
  { value: "retirement_accounts", label: "Retirement accounts", description: "401(k), IRA, pension pots and similar" },
  { value: "real_estate", label: "Real estate" },
  { value: "foreign_companies", label: "Foreign companies" },
  { value: "brazilian_companies", label: "Brazilian companies" },
  { value: "trust_interests", label: "Trust interests" },
  { value: "crypto_assets", label: "Cryptocurrency" },
  { value: "loans_receivable", label: "Loans receivable" },
  { value: "other_assets", label: "Other assets" },
];

export interface DocumentDef {
  id: string;
  label: string;
  description: string;
}

export const DOCUMENT_DEFS: DocumentDef[] = [
  {
    id: "passport_immigration",
    label: "Passport or immigration record",
    description: "Entry and exit records that show your time in Brazil.",
  },
  {
    id: "prior_brazilian_return",
    label: "Prior Brazilian tax return",
    description: "Any return previously filed in Brazil, including a departure declaration.",
  },
  {
    id: "foreign_tax_return",
    label: "Foreign tax return",
    description: "The most recent return filed outside Brazil.",
  },
  {
    id: "salary_statement",
    label: "Salary statement",
    description: "Payslips or annual employment summaries.",
  },
  {
    id: "retirement_statement",
    label: "Retirement statement",
    description: "Social Security, pension or private plan statements.",
  },
  {
    id: "bank_statement",
    label: "Bank statement",
    description: "Year-end balances and interest earned.",
  },
  {
    id: "brokerage_statement",
    label: "Brokerage statement",
    description: "Holdings, dividends and realised gains.",
  },
  {
    id: "corporate_documents",
    label: "Corporate documents",
    description: "Ownership records, financial statements and distributions.",
  },
  {
    id: "property_documents",
    label: "Property documents",
    description: "Deeds, purchase records and rental agreements.",
  },
  {
    id: "foreign_tax_evidence",
    label: "Foreign tax payment evidence",
    description: "Withholding certificates and payment receipts.",
  },
  {
    id: "trust_documents",
    label: "Trust documents",
    description: "Trust deeds and distribution statements.",
  },
  {
    id: "other_documents",
    label: "Other documents",
    description: "Anything else you believe is relevant to your position.",
  },
];

export function labelFor(options: Option[], value?: string): string {
  if (!value) return "Not answered";
  const found = options.find((option) => option.value === value);
  return found ? found.label : value;
}
