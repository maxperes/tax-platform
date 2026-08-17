import { describe, expect, it } from "vitest";
import {
  applyBrIrpfExt001,
  BR_IRPF_EXT_001_META,
  residenteEm,
  vencimentoCarneLeao
} from "./br-irpf-ext-001.js";
import { convertToBrlCamBio001 } from "./br-cambio-001.js";
import { computeCredExt001 } from "./br-cred-ext-001.js";

describe("BR-IRPF-EXT-001", () => {
  it("exposes rule metadata", () => {
    expect(BR_IRPF_EXT_001_META.id).toBe("BR-IRPF-EXT-001");
    expect(BR_IRPF_EXT_001_META.dependeDe).toContain("BR-CAMBIO-001");
    expect(BR_IRPF_EXT_001_META.dependeDe).toContain("BR-RESID-001");
  });

  it("Case A — Social Security, resident, no dependents", () => {
    const result = applyBrIrpfExt001(
      {
        dataInicioResidenciaBr: "2025-01-01",
        dependentes: 0,
        itens: [
          {
            id: "ssa",
            natureza: "aposentadoria",
            paisFonte: "US",
            dataDisponibilidade: "2026-01-15",
            moeda: "USD",
            valorBruto: 2400,
            impostoPagoExterior: 210,
            taxaConversaoBrl: 5.4,
            documentos: ["ssa1099"]
          }
        ]
      },
      { vencimentoOverrides: { "2026-01": "2026-02-27" } }
    );

    expect(result.months).toHaveLength(1);
    const m = result.months[0]!;
    expect(m.base_calculo_brl).toBe(12960);
    expect(m.imposto_apurado_brl).toBe(2655.27);
    expect(m.credito_exterior_aplicado_brl).toBe(1134);
    expect(m.imposto_a_recolher_brl).toBe(1521.27);
    expect(m.vencimento).toBe("2026-02-27");
    expect(m.grau_de_certeza).toBe("pacifico");
    expect(m.revisao_profissional_obrigatoria).toBe(false);
    expect(m.obrigacoes_acessorias).toContain("BR-DEVER-CARNE-001");
    expect(m.trace.regras_aplicadas).toContain("BR-CRED-EXT-001");
  });

  it("Case B — US rent + private pension, one dependent (credit limit)", () => {
    const result = applyBrIrpfExt001({
      dataInicioResidenciaBr: "2025-01-01",
      dependentes: 1,
      itens: [
        {
          id: "rent",
          natureza: "aluguel",
          paisFonte: "US",
          dataDisponibilidade: "2026-03-10",
          moeda: "USD",
          valorBruto: 3000,
          impostoPagoExterior: 400,
          taxaConversaoBrl: 5.25
        },
        {
          id: "pension",
          natureza: "aposentadoria",
          paisFonte: "US",
          dataDisponibilidade: "2026-03-10",
          moeda: "USD",
          valorBruto: 1500,
          taxaConversaoBrl: 5.25
        }
      ]
    });

    const m = result.months[0]!;
    expect(m.base_calculo_brl).toBe(23435.41);
    expect(m.imposto_apurado_brl).toBe(5536.01);
    expect(m.limite_credito_brl).toBe(4331.25);
    expect(m.credito_exterior_aplicado_brl).toBe(2100);
    expect(m.imposto_a_recolher_brl).toBe(3436.01);
  });

  it("Case C — foreign retirement age 68 — dual scenarios, no single decision", () => {
    const result = applyBrIrpfExt001({
      dataInicioResidenciaBr: "2025-01-01",
      idade: 68,
      dependentes: 0,
      itens: [
        {
          id: "ssa68",
          natureza: "aposentadoria",
          paisFonte: "US",
          dataDisponibilidade: "2026-04-15",
          moeda: "USD",
          valorBruto: 2400,
          taxaConversaoBrl: 5.4
        }
      ]
    });

    const m = result.months[0]!;
    expect(m.revisao_profissional_obrigatoria).toBe(true);
    expect(m.grau_de_certeza).toBe("controvertido");
    expect(m.cenarios).toBeDefined();
    expect(m.cenarios!.diferenca_brl).toBeGreaterThan(0);
    expect(m.cenarios!.sem_isencao.imposto_apurado_brl).toBeGreaterThan(
      m.cenarios!.com_parcela_isenta_65.imposto_apurado_brl
    );
    expect(result.items[0]!.outcome).toBe("controvertido");
  });

  it("Case D — income before residency is fora_do_campo (not isento)", () => {
    const result = applyBrIrpfExt001({
      dataInicioResidenciaBr: "2026-07-01",
      itens: [
        {
          id: "pre",
          natureza: "aposentadoria",
          paisFonte: "US",
          dataDisponibilidade: "2026-03-01",
          moeda: "USD",
          valorBruto: 2000,
          taxaConversaoBrl: 5.4
        }
      ]
    });

    expect(result.months).toHaveLength(0);
    expect(result.foraDoCampo).toHaveLength(1);
    expect(result.foraDoCampo[0]!.outcome).toBe("fora_do_campo");
    expect(result.foraDoCampo[0]!.notes.join(" ")).toMatch(/fora_do_campo/i);
    expect(result.foraDoCampo[0]!.notes.join(" ")).not.toMatch(/^isento$/i);
  });

  it("Case E — 50% co-ownership on rental", () => {
    const result = applyBrIrpfExt001({
      dataInicioResidenciaBr: "2025-01-01",
      dependentes: 0,
      itens: [
        {
          id: "rent50",
          natureza: "aluguel",
          paisFonte: "US",
          dataDisponibilidade: "2026-05-05",
          moeda: "USD",
          valorBruto: 4000,
          titularidade: 0.5,
          taxaConversaoBrl: 5.0
        }
      ]
    });

    // US$ 2,000 * 5.0 = R$ 10,000 base
    expect(result.months[0]!.base_calculo_brl).toBe(10000);
    expect(result.items[0]!.valorBrutoProporcional).toBe(2000);
  });

  it("is deterministic on reprocess", () => {
    const input = {
      dataInicioResidenciaBr: "2025-01-01",
      dependentes: 0,
      itens: [
        {
          natureza: "aposentadoria" as const,
          paisFonte: "US",
          dataDisponibilidade: "2026-01-15",
          moeda: "USD",
          valorBruto: 2400,
          impostoPagoExterior: 210,
          taxaConversaoBrl: 5.4
        }
      ]
    };
    const a = applyBrIrpfExt001(input, { vencimentoOverrides: { "2026-01": "2026-02-27" } });
    const b = applyBrIrpfExt001(input, { vencimentoOverrides: { "2026-01": "2026-02-27" } });
    expect(a).toEqual(b);
  });
});

describe("BR-CAMBIO-001 / BR-CRED-EXT-001 helpers", () => {
  it("converts with explicit rate", () => {
    const r = convertToBrlCamBio001({
      valor: 2400,
      moeda: "USD",
      dataDisponibilidade: "2026-01-15",
      taxaConversaoBrl: 5.4
    });
    expect(r.valorBrl).toBe(12960);
    expect(r.metodo).toBe("explicit");
  });

  it("limits foreign credit to marginal BR tax", () => {
    const r = computeCredExt001({
      impostoBrasileiroComRendimento: 5536.01,
      impostoBrasileiroSemRendimento: 1204.76,
      impostoPagoExteriorBrl: 2100,
      reciprocidadeReconhecida: true
    });
    expect(r.limiteCreditoBrl).toBe(4331.25);
    expect(r.creditoAplicadoBrl).toBe(2100);
  });

  it("residency date gate", () => {
    expect(residenteEm({ dataInicioResidenciaBr: "2026-07-01" }, "2026-06-30")).toBe(false);
    expect(residenteEm({ dataInicioResidenciaBr: "2026-07-01" }, "2026-07-01")).toBe(true);
  });

  it("carne-leao due date is end of following month", () => {
    expect(vencimentoCarneLeao("2026-01")).toBe("2026-02-28");
  });
});
