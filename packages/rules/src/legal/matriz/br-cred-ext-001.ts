/**
 * BR-CRED-EXT-001 — credit for foreign income tax paid (US–BR reciprocity path).
 *
 * Limit is per foreign-income bundle: BR tax WITH the income − BR tax WITHOUT it.
 * No comprehensive US–BR treaty; reciprocity shifts burden of proof, not the right.
 */

export type CredExtResult = {
  regraId: "BR-CRED-EXT-001";
  impostoPagoExteriorBrl: number;
  limiteCreditoBrl: number;
  creditoAplicadoBrl: number;
  excedenteBrl: number;
  notes: string[];
  premissas: string[];
};

export function computeCredExt001(input: {
  impostoBrasileiroComRendimento: number;
  impostoBrasileiroSemRendimento: number;
  impostoPagoExteriorBrl: number;
  reciprocidadeReconhecida?: boolean;
  premissaRateio?: string;
}): CredExtResult {
  const notes: string[] = [];
  const premissas: string[] = [];

  if (input.reciprocidadeReconhecida === false) {
    notes.push("Reciprocity not recognized for origin country — credit denied.");
    return {
      regraId: "BR-CRED-EXT-001",
      impostoPagoExteriorBrl: input.impostoPagoExteriorBrl,
      limiteCreditoBrl: 0,
      creditoAplicadoBrl: 0,
      excedenteBrl: input.impostoPagoExteriorBrl,
      notes,
      premissas
    };
  }

  premissas.push(
    input.reciprocidadeReconhecida === true
      ? "US reciprocity recognized by RFB declarative act (confirm current Ato Declaratório)"
      : "Reciprocity assumed for US origin — confirm Ato Declaratório"
  );
  if (input.premissaRateio) premissas.push(input.premissaRateio);

  const limite = Math.max(
    0,
    round2(input.impostoBrasileiroComRendimento - input.impostoBrasileiroSemRendimento)
  );
  const aplicado = round2(Math.min(Math.max(0, input.impostoPagoExteriorBrl), limite));
  const excedente = round2(Math.max(0, input.impostoPagoExteriorBrl - aplicado));

  if (excedente > 0) {
    notes.push("Foreign tax exceeds Brazilian marginal limit — excess does not generate refund under this rule.");
  }

  return {
    regraId: "BR-CRED-EXT-001",
    impostoPagoExteriorBrl: round2(input.impostoPagoExteriorBrl),
    limiteCreditoBrl: limite,
    creditoAplicadoBrl: aplicado,
    excedenteBrl: excedente,
    notes,
    premissas
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
