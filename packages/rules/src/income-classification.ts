import type { FiscalProfile, IncomeSource } from "@tax-platform/shared";

export function classifyIncome(
  income: IncomeSource,
  fiscalProfile: FiscalProfile
): IncomeSource & { classification: NonNullable<IncomeSource["classification"]> } {
  const origin =
    income.originCountry === "BR"
      ? "brazil"
      : income.originCountry === "US"
        ? "foreign"
        : "foreign";

  let taxTreatment: NonNullable<IncomeSource["classification"]>["taxTreatment"] = "taxable";
  let calculationModule: NonNullable<IncomeSource["classification"]>["calculationModule"] = "irpf";
  let lei14754ForeignProfitsEligible: boolean | undefined;
  let ftcBasket: "passive" | "general" | undefined;

  const complexNature = ["trust", "other"].includes(income.nature);
  if (complexNature || income.incomeType.toLowerCase().includes("rsu")) {
    taxTreatment = "complex";
    calculationModule = "trust_offshore";
  } else if (fiscalProfile === "resident_usa") {
    taxTreatment = "taxable";
    calculationModule = "irpf";
    const t = income.incomeType.toLowerCase();
    const passive =
      t.includes("dividend") ||
      t.includes("interest") ||
      t.includes("rent") ||
      t.includes("royalty") ||
      income.nature === "investment";
    ftcBasket = passive ? "passive" : "general";
  } else if (fiscalProfile === "resident_brazil" && origin === "foreign") {
    taxTreatment = "taxable";
    calculationModule = "carnet_leao";
    const divLike =
      income.nature === "investment" &&
      (income.incomeType.toLowerCase().includes("dividend") ||
        income.incomeType.toLowerCase().includes("profit") ||
        income.incomeType.toLowerCase().includes("distribution"));
    if (divLike) {
      lei14754ForeignProfitsEligible = true;
    }
  } else if (fiscalProfile === "non_resident_brazil") {
    taxTreatment = "pending";
    calculationModule = "irpf";
  }

  return {
    ...income,
    classification: {
      origin,
      nature: income.incomeType,
      taxTreatment,
      calculationModule,
      ...(lei14754ForeignProfitsEligible !== undefined ? { lei14754ForeignProfitsEligible } : {}),
      ...(ftcBasket !== undefined ? { ftcBasket } : {})
    }
  };
}
