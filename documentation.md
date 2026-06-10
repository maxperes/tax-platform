# Documento de Requisitos – Sistema de Tributação Internacional (Brasil ↔ EUA)


## 1. Visão Geral

Sistema para cálculo de tributação internacional para pessoas físicas com foco Brasil–EUA.

## 2. Requisitos Funcionais

- RF-001: Cadastro de usuário e residência fiscal
- RF-002: Cadastro de múltiplas fontes de renda
- RF-003: Identificação de eventos tributáveis
- RF-004: Classificação de renda
- RF-005: Cálculo de imposto
- RF-006: Aplicação de deduções
- RF-007: Cadastro de patrimônio
- RF-008: Identificação de transferências internacionais
- RF-009: Cadastro de trust
- RF-010: Diferenciação trust revogável/irrevogável
- RF-011: Cálculo de ganho de capital
- RF-012: Geração de relatório
- RF-013: Simulação PF vs PJ
- RF-014: Atualização contínua de dados
- RF-015: Suporte a múltiplas rendas
- RF-016: Entrada manual e futura integração
- RF-017: Cálculo mensal (carnê-leão)

## 3. Requisitos Não Funcionais

- RNF-001: Segurança de dados
- RNF-002: Escalabilidade
- RNF-003: Alta disponibilidade
- RNF-004: Usabilidade
- RNF-005: Extensibilidade
- RNF-006: Atualização de regras
- RNF-007: Performance

### Implementação: motor de cálculo (BR + EUA, ano-calendário 2026)

O cálculo tributário é **determinístico** no pacote `packages/rules` (tabelas em `src/data/br/2026.ts` e `src/data/us/2026.ts`, motores em `src/engines/`). O chat/LLM **não** calcula imposto.

- **Versionamento:** constantes `ENGINE_VERSION` e pacotes de dados `DATA_PACK_BR_2026` / `DATA_PACK_US_2026` em `@tax-platform/shared`; carimbo completo `buildRuleVersionStamp()` gravado em `ruleVersion`, `dataPackVersion` e `jurisdiction` nas entidades Prisma (`TaxCalculation`, `MonthlyTaxCalculation`, `CapitalGainCalculation`, `TaxReport`).
- **Perfil fiscal:** residente EUA usa estimativa anual US; residente Brasil (e não residente / indeterminado) usa IRPF progressivo BR + Carnê-Leão mensal; **dual** gera estimativas BR e US e mantém revisão adicional.
- **Câmbio:** `packages/rules/src/fx.ts` — ausência de taxa para moeda estrangeira marca `requiresAdditionalReview` em vez de assumir câmbio 1:1 silenciosamente.
- **Atualização entre releases:** tabela `RuleOverride` (Postgres); mesclagem em tempo de cálculo. Admin: `GET/POST/PATCH/DELETE /api/admin/rule-overrides`, bulk recompute `POST /api/admin/rules/recompute-sessions`. Freshness: `GET /api/tax-rules/freshness?taxYear=`. Processo completo: [docs/tax-rules-governance.md](docs/tax-rules-governance.md).

Sempre validar alíquotas e faixas com **especialista fiscal** antes de uso em produção.

## 4. Regras de Negócio

- RN-001: Renda exterior tributada no Brasil
- RN-002: Transferência própria não tributável
- RN-003: Trust irrevogável pode não ser tributado
- RN-004: Trust revogável tributável
- RN-005: Ganho de capital separado
- RN-006: Aplicação de deduções
- RN-007: Aplicação de isenções
- RN-008: Crédito tributário internacional
- RN-009: Tributação mensal (carnê-leão)

### RF-001: Cadastro de usuário e residência fiscal

#### Descrição
O sistema deve permitir que o usuário cadastre seus dados básicos e informe sua residência fiscal, pois essa informação é essencial para determinar se ele estará sujeito à tributação no Brasil, nos Estados Unidos ou em ambos.
A residência fiscal será uma das primeiras informações coletadas, já que ela influencia diretamente quais regras tributárias serão aplicadas pelo sistema.
#### Objetivo
Identificar corretamente o perfil fiscal do usuário para que o sistema consiga:
    - determinar se a pessoa é residente fiscal no Brasil;
    - determinar se possui vínculo fiscal com os Estados Unidos;
    - aplicar corretamente regras de tributação sobre renda, patrimônio e transferências;
    - definir se rendimentos estrangeiros devem ser declarados no Brasil;
    - avaliar possibilidade de crédito tributário internacional.
#### Dados que devem ser coletados
#### Dados básicos do usuário
- Nome completo
- E-mail
- País de nacionalidade
- País de residência atual
- CPF, se aplicável
- Identificação fiscal estrangeira, se aplicável
- Data de nascimento
- Moeda principal utilizada pelo usuário
#### Dados de residência fiscal
- O usuário é residente fiscal no Brasil?
- O usuário é residente fiscal nos Estados Unidos?
- O usuário possui residência fiscal em outro país?
- Data de início da residência fiscal no Brasil
- Data de saída fiscal do Brasil, se aplicável
- O usuário entregou declaração de saída definitiva do Brasil?
- O usuário mora fisicamente no Brasil?
- Quantos dias permaneceu no Brasil no ano-calendário?
- Quantos dias permaneceu nos Estados Unidos no ano-calendário?
- Possui green card?
- Possui cidadania americana?
- Possui visto de trabalho nos EUA?
- Possui endereço permanente no Brasil?
- Possui endereço permanente nos EUA?
- Possui dependentes fiscais no Brasil ou no exterior?

#### Regras associadas
**RN-001 — Residente fiscal no Brasil**
Se o usuário for residente fiscal no Brasil, o sistema deve considerar que rendimentos recebidos do exterior podem estar sujeitos à tributação brasileira.
**RN-002 — Não residente fiscal no Brasil**
Se o usuário não for residente fiscal no Brasil, o sistema deve limitar a análise tributária brasileira apenas aos rendimentos, bens ou eventos com conexão fiscal com o Brasil.
**RN-003 — Dupla residência fiscal**
Se o usuário indicar residência fiscal em mais de um país, o sistema deve marcar o caso como complexo e solicitar informações adicionais.
**RN-004 — Saída definitiva**
Se o usuário informou que saiu do Brasil e apresentou declaração de saída definitiva, o sistema deve tratar o usuário como potencial não residente fiscal no Brasil a partir da data informada.
#### Fluxo esperado
1. Usuário inicia o cadastro.
2. Sistema solicita dados pessoais básicos.
3. Sistema apresenta perguntas sobre residência fiscal.
4. Usuário informa sua situação no Brasil, EUA e outros países.
5. Sistema classifica o usuário em uma categoria fiscal inicial:
    - residente fiscal no Brasil;
    - não residente fiscal no Brasil;
    - residente fiscal nos EUA;
    - possível dupla residência fiscal;
    - caso indeterminado.
6. Sistema usa essa classificação para determinar quais módulos tributários serão ativados.
### RF-002 — Cadastro de múltiplas fontes de renda
#### Descrição
O sistema deve permitir que o usuário cadastre uma ou mais fontes de renda, nacionais ou estrangeiras, para que o motor de regras consiga identificar hipóteses de incidência tributária, calcular imposto de renda, aplicar deduções e avaliar possível aproveitamento de crédito tributário.
Esse requisito é central porque, conforme a transcrição, grande parte da lógica do sistema depende de saber quanto o usuário ganha, de onde vem a renda e qual é a natureza dessa renda.
#### Objetivo
Permitir que o sistema identifique:
    - origem da renda: Brasil, EUA ou outro país;
    - tipo de renda;
    - periodicidade do recebimento;
    - moeda do recebimento;
    - se houve imposto retido ou pago no exterior;
    - se a renda deve ser tratada como tributável, isenta, parcialmente tributável ou pendente de análise;
    - se a renda deve entrar em carnê-leão, ganho de capital ou outro módulo de cálculo.
#### Tipos de renda que o sistema deve suportar
#### Rendas de trabalho
- Salário
- Bônus
- Remuneração por serviços
- Freelance / contractor
- Participação em lucros
- Stock options
- RSUs / ações recebidas como remuneração
#### Rendas previdenciárias
- Aposentadoria
- Pensão
- Social Security
- 401(k)
- Roth 401(k)
- IRA
- Roth IRA
#### Rendas de investimento
- Dividendos
- Juros
- Ganho de capital
- Venda de ações
- Venda de cotas
- Distribuição de fundos
- Criptoativos
#### Rendas patrimoniais
- Aluguel
- Venda de imóvel
- Venda de veículo
- Transferência de patrimônio
- Distribuição de bens
#### Rendas societárias
- Distribuição de lucros
- Dividendos de empresa
- Pró-labore
- Participação societária
- Venda de cotas sociais

#### Rendas vinculadas a estruturas internacionais
- Pagamento de trust
- Distribuição de trust
- Acúmulo patrimonial em trust
- Pagamento por entidade offshore
- Distribuição de entidade estrangeira
#### Dados a serem coletados por fonte de renda
Para cada fonte de renda, o sistema deve coletar:
    - Nome da fonte pagadora
    - País de origem da renda
    - Tipo da renda
    - Valor bruto recebido
    - Moeda original
    - Data do recebimento
    - Periodicidade:
    - mensal
    - anual
    - eventual
    - recorrente
    - Imposto pago no país de origem
    - Imposto retido na fonte
    - Documento comprobatório disponível
    - Conta de destino do recebimento
    - Se o valor foi transferido para o Brasil
    - Se o valor permaneceu no exterior
    - Natureza da renda:
    - trabalho
    - investimento
    - aposentadoria
    - patrimônio
    - societária
    - trust
    - outra
    - Observações livres do usuário
#### Regras associadas
**RN-001 — Renda estrangeira recebida por residente fiscal no Brasil**
Se o usuário for residente fiscal no Brasil e receber renda do exterior, o sistema deve marcar essa renda como potencialmente tributável no Brasil.
**RN-002 — Carnê-leão**
Se a renda for recebida do exterior por pessoa física residente fiscal no Brasil, o sistema deve encaminhar essa renda para o módulo de cálculo mensal do carnê-leão.
**RN-003 — Transferência entre contas próprias**
Se o usuário apenas transferiu dinheiro entre contas próprias, sem novo fato gerador de renda, o sistema não deve classificar a operação como renda tributável.
**RN-004 — Imposto pago no exterior**
Se o usuário informar imposto pago ou retido nos EUA, o sistema deve armazenar essa informação para futura avaliação de crédito tributário.
**RN-005 — Remuneração em ações**
Se a renda for recebida em ações, RSUs ou stock options, o sistema deve marcar o caso como renda complexa e solicitar dados adicionais, como data de vesting, valor justo de mercado e eventual venda posterior.
**RN-006 — Trust**
Se a renda tiver origem em trust, o sistema deve solicitar informações adicionais sobre o tipo de trust, controle do beneficiário, periodicidade dos pagamentos e características jurídicas da estrutura.
#### Fluxo esperado
1. Usuário acessa o módulo de rendas.
2. Sistema pergunta se o usuário possui renda no Brasil, nos EUA ou em outro país.
3. Usuário adiciona uma ou mais fontes de renda.
4. Para cada fonte, o sistema solicita tipo, origem, valor, moeda, data e periodicidade.
5. Sistema verifica a residência fiscal do usuário.
6. Sistema classifica cada renda como:
    - tributável;
    - não tributável;
    - isenta;
    - parcialmente tributável;
    - pendente de análise;
    - caso complexo.
7. Sistema direciona cada renda para o módulo apropriado:
    - imposto de renda;
    - carnê-leão;
    - ganho de capital;
    - trust;
    - crédito tributário;
    - simulação patrimonial.
8. Sistema consolida as rendas cadastradas para cálculo posterior.
### RF-003 — Identificação de eventos tributáveis (Hipóteses de Incidência)
#### Descrição
O sistema deve identificar automaticamente eventos que geram tributação (tax triggers) a partir dos dados informados pelo usuário (rendas, patrimônio, transações e estruturas).
Esse requisito transforma dados brutos (RF-001 e RF-002) em fatos tributários, que serão usados pelo motor de cálculo.
#### Objetivo
Detectar, classificar e marcar eventos que podem gerar obrigação tributária, permitindo que o sistema:
    - determine se há incidência de imposto;
    - identifique o tipo de tributação aplicável;
    - encaminhe o evento para o módulo correto (IR, ganho de capital, carnê-leão, etc.);
    - diferencie eventos tributáveis de não tributáveis;
    - sinalize casos complexos ou ambíguos.
#### Definição de Evento Tributável
Um evento tributável ocorre quando há:
    - acréscimo patrimonial;
    - recebimento de renda;
    - alienação de ativo com ganho;
    - transferência com potencial fato gerador.
#### Tipos de eventos a serem identificados
1. Eventos de renda
    - Recebimento de salário
    - Recebimento de dividendos
    - Recebimento de juros
    - Recebimento de aluguel
    - Recebimento de pensão ou aposentadoria
    - Recebimento de valores de trust
    - Recebimento de rendimentos do exterior
2. Eventos de ganho de capital
    - Venda de imóvel
    - Venda de ações
    - Venda de cotas
    - Venda de criptoativos
    - Venda de veículos
    - Alienação de qualquer ativo com lucro
3. Eventos patrimoniais
    - Aquisição de bens
    - Transferência de bens
    - Doação recebida
    - Herança recebida
4. Eventos internacionais
    - Entrada de recursos do exterior
    - Remuneração paga por empresa estrangeira
    - Transferência entre contas internacionais
    - Recebimento de renda offshore
5. Eventos societários
    - Distribuição de lucros
    - Pró-labore
    - Venda de participação societária
    - Aumento de capital
6. Eventos complexos
    - Vesting de RSU / stock options
    - Distribuição de trust
    - Acúmulo patrimonial em trust
    - Mudança de residência fiscal
    - Operações com múltiplas jurisdições
#### Dados de entrada necessários
O sistema deve utilizar dados provenientes de:
    - RF-001 (residência fiscal)
    - RF-002 (fontes de renda)
    - Cadastro de ativos
    - Registro de transações
    - Informações sobre estruturas (ex: trust)
#### Regras associadas

**RN-001 — Acréscimo patrimonial**
Se o evento representar aumento de patrimônio, deve ser classificado como potencialmente tributável.
**RN-002 — Renda recebida**
Se houver recebimento de renda, o sistema deve classificar como evento tributável, salvo exceções (isenções).
**RN-003 — Transferência entre contas próprias**
Se a transferência for entre contas do mesmo titular, o evento não deve ser classificado como tributável.
**RN-004 — Ganho de capital**
Se houver venda de ativo com lucro, o sistema deve gerar evento tributável de ganho de capital.
**RN-005 — Renda estrangeira**
Se a renda tiver origem no exterior e o usuário for residente fiscal no Brasil, o sistema deve marcar como evento tributável no Brasil.
**RN-006 — Trust**
Se houver distribuição ou controle sobre trust, o sistema deve classificar como evento potencialmente tributável e solicitar análise adicional.
**RN-007 — Isenções**
Se o evento atender critérios de isenção, deve ser classificado como não tributável ou isento.
#### Fluxo esperado
1. Sistema recebe dados do usuário (renda, patrimônio, transações).
2. Sistema percorre cada registro.
3. Para cada item:
    - identifica tipo de evento;
    - verifica se há acréscimo patrimonial;
    - avalia origem (Brasil ou exterior);
    - aplica regras de incidência.
4. Sistema classifica o evento como:
    - tributável;
    - não tributável;
    - isento;
    - parcialmente tributável;
    - pendente de análise;
    - caso complexo.
5. Sistema gera lista consolidada de eventos tributáveis.
### RF-004 — Classificação de renda
#### Descrição
O sistema deve classificar cada fonte de renda cadastrada pelo usuário conforme sua natureza tributária, origem, periodicidade, moeda, país de origem e regra de tributação aplicável.
Esse requisito vem depois do RF-002 e RF-003. Ou seja:
    - RF-002 cadastra a renda;
    - RF-003 identifica se existe evento tributável;
    - RF-004 classifica essa renda corretamente para cálculo.
#### Objetivo
Permitir que o sistema determine como cada renda deve ser tratada no cálculo tributário, classificando-a em categorias como:
    - renda tributável;
    - renda isenta;
    - renda não tributável;
    - renda sujeita a carnê-leão;
    - renda sujeita a ganho de capital;
    - renda com possibilidade de crédito tributário;
    - renda complexa;
    - renda pendente de análise.
#### Tipos principais de classificação
1. Por origem
    - Renda nacional
    - Renda estrangeira
    - Renda mista
    - Renda sem origem determinada
2. Por natureza
    - Salário
    - Pensão
    - Aposentadoria
    - Social Security
    - Dividendos
    - Juros
    - Aluguel
    - Distribuição de lucros
    - Pró-labore
    - Ganho de capital
    - Trust
    - RSU / stock compensation
    - Criptoativos
    - Transferência patrimonial
    - Herança
    - Doação
3. Por tratamento tributário
    - Tributável
    - Isenta
    - Não tributável
    - Parcialmente tributável
    - Compensável com crédito tributário
    - Pendente de análise
    - Caso complexo
4. Por módulo de cálculo
    - Imposto de renda pessoa física
    - Carnê-leão
    - Ganho de capital
    - Crédito tributário internacional
    - Trust / offshore
    - Simulação patrimonial
    - Simulação pessoa física vs pessoa jurídica
#### Dados de entrada necessários
Para classificar a renda, o sistema deve considerar:
    - tipo da renda informado pelo usuário;
    - país de origem;
    - país de residência fiscal do usuário;
    - valor recebido;
    - moeda;
    - data de recebimento;
    - periodicidade;
    - imposto pago ou retido no exterior;
    - existência de documento comprobatório;
    - se houve transferência para o Brasil;
    - se a renda permaneceu no exterior;
    - se a renda tem relação com trust, empresa, ações ou patrimônio.
#### Regras associadas

**RN-001 — Renda nacional**
Se a renda tiver origem no Brasil e o usuário for residente fiscal no Brasil, o sistema deve classificá-la como renda nacional tributável, salvo regra de isenção.
**RN-002 — Renda estrangeira**
Se a renda tiver origem fora do Brasil e o usuário for residente fiscal no Brasil, o sistema deve classificá-la como renda estrangeira potencialmente tributável no Brasil.
**RN-003 — Renda sujeita a carnê-leão**
Se a renda for recebida do exterior por pessoa física residente fiscal no Brasil, o sistema deve classificá-la como sujeita a carnê-leão.
**RN-004 — Ganho de capital**
Se a renda decorre da venda de um ativo com lucro, o sistema deve classificá-la como ganho de capital e direcioná-la ao módulo específico de apuração.
**RN-005 — Dividendos ou distribuição de lucros**
Se a renda for recebida como dividendo ou distribuição societária, o sistema deve classificá-la como renda de investimento ou renda societária, conforme origem e natureza informada.
**RN-006 — Trust**
Se a renda tiver origem em trust, o sistema deve classificá-la como renda complexa e exigir perguntas adicionais sobre:
    - tipo de trust;
    - revogável ou irrevogável;
    - controle do beneficiário;
    - periodicidade dos pagamentos;
    - jurisdição;
    - cláusulas de proteção;
    - titularidade dos ativos.
**RN-007 — Remuneração em ações**
Se a renda for recebida em ações, RSUs ou stock options, o sistema deve classificá-la como renda complexa, pois pode exigir análise tanto no momento do vesting quanto na venda futura.
**RN-008 — Transferência própria**
Se o valor informado for apenas transferência entre contas de mesma titularidade, o sistema não deve classificá-lo como renda.
#### Fluxo esperado
1. Sistema recebe a lista de fontes de renda cadastradas no RF-002.
2. Sistema verifica a residência fiscal do usuário.
3. Para cada renda, avalia:
    - origem;
    - natureza;
    - moeda;
    - periodicidade;
    - existência de imposto pago;
    - relação com patrimônio ou investimento.
4. Sistema aplica as regras de classificação.
5. Sistema atribui uma categoria tributária.
6. Sistema direciona a renda ao módulo correto de cálculo.
7. Sistema sinaliza se a renda exige revisão ou dados adicionais.
### RF-005 — Cálculo de imposto
#### Descrição
O sistema deve calcular o imposto estimado devido pelo usuário com base nas rendas, eventos tributáveis, classificações fiscais, deduções, isenções e créditos tributários aplicáveis.
Esse requisito depende diretamente dos requisitos anteriores:
    - RF-001: residência fiscal;
    - RF-002: fontes de renda;
    - RF-003: eventos tributáveis;
    - RF-004: classificação da renda.
#### Objetivo
Permitir que o sistema gere uma estimativa de imposto a pagar, considerando:
    - base de cálculo;
    - tipo de renda;
    - alíquota aplicável;
    - país de origem;
    - residência fiscal do usuário;
    - periodicidade da renda;
    - imposto já pago ou retido;
    - deduções;
    - isenções;
    - eventual crédito tributário internacional.
#### Escopo do cálculo
O cálculo deve contemplar inicialmente:
    - imposto de renda pessoa física;
    - carnê-leão mensal;
    - ganho de capital;
    - renda estrangeira;
    - renda offshore;
    - dividendos;
    - aposentadoria;
    - pensão;
    - distribuição de trust;
    - rendimentos em ações/RSU;
    - transferências patrimoniais;
    - simulações comparativas.
#### Dados de entrada necessários
Para calcular imposto, o sistema deve receber:
    - perfil fiscal do usuário;
    - lista de rendas classificadas;
    - eventos tributáveis;
    - valores brutos;
    - moedas originais;
    - taxas de câmbio;
    - datas de recebimento;
    - país de origem da renda;
    - imposto pago no exterior;
    - deduções aplicáveis;
    - isenções aplicáveis;
    - custo de aquisição, quando houver ganho de capital;
    - valor de venda, quando houver alienação;
    - tipo de estrutura envolvida, quando houver trust ou offshore.
#### Regras associadas
**RN-001 — Base de cálculo**
O sistema deve calcular a base de cálculo antes de aplicar a alíquota.
#### Exemplo:
Base de cálculo = valor bruto - deduções aplicáveis - valores isentos
**RN-002 — Aplicação de alíquota**
Após calcular a base de cálculo, o sistema deve aplicar a alíquota correspondente ao tipo de renda e ao regime tributário aplicável.
#### Exemplo inicial simplificado:
Imposto estimado = base de cálculo × alíquota
**RN-003 — Alíquota de IRPF**
Para rendas sujeitas ao imposto de renda da pessoa física no Brasil, o sistema deve aplicar a alíquota correspondente conforme a tabela vigente.
No MVP, conforme a premissa da transcrição, o sistema pode considerar uma alíquota padrão de 27,5% para usuários acima da faixa de isenção.
**RN-004 — Carnê-leão**
Se a renda for estrangeira e recebida por residente fiscal no Brasil, o sistema deve calcular o imposto mensal via carnê-leão.
O cálculo deve ser agrupado por mês de recebimento.
**RN-005 — Ganho de capital**
Se a renda for proveniente de venda de ativo, o sistema deve calcular:
Ganho de capital = valor de venda - custo de aquisição - despesas permitidas
Após isso, deve aplicar a alíquota correspondente ao ganho de capital.
**RN-006 — Crédito tributário internacional**
Se houver imposto pago no exterior, o sistema deve armazenar e considerar esse valor para possível abatimento, conforme regra aplicável.
No MVP, o sistema pode apenas demonstrar o imposto bruto e o imposto pago no exterior separadamente.
Em fase futura, o sistema poderá calcular automaticamente o crédito aproveitável.
**RN-007 — Deduções**
Antes do cálculo final, o sistema deve aplicar deduções permitidas, quando informadas e elegíveis.
#### Exemplos:
- dependentes;
- despesas médicas;
- previdência;
- outras deduções parametrizadas.
**RN-008 — Isenções**
Se o usuário se enquadrar em uma hipótese de isenção, o sistema deve reduzir total ou parcialmente a base de cálculo.
#### Exemplo citado na transcrição:
- isenção por condição de saúde específica
**RN-009 — Casos complexos**
Se o evento envolver trust, RSU, stock options, offshore ou dupla residência fiscal, o sistema deve permitir cálculo preliminar, mas marcar o resultado como “requer revisão”.
#### Fluxo esperado
1. Sistema recupera o perfil fiscal do usuário.
2. Sistema recupera todas as rendas classificadas.
3. Sistema recupera eventos tributáveis.
4. Sistema agrupa os eventos por:
    - mês;
    - ano;
    - tipo de renda;
    - país de origem;
    - módulo de cálculo.
5. Sistema calcula a base de cálculo.
6. Sistema aplica deduções e isenções.
7. Sistema aplica a alíquota correta.
8. Sistema considera imposto pago no exterior, quando informado.
9. Sistema calcula:
    - imposto bruto;
    - deduções;
    - isenções;
    - imposto líquido estimado;
    - imposto pago no exterior;
    - saldo estimado a pagar.
10. Sistema gera resultado detalhado para relatório.
#### Fórmulas iniciais
#### Cálculo simples de IR
Base tributável = renda bruta - deduções - isenções
Imposto bruto = base tributável × alíquota
Imposto estimado a pagar = imposto bruto - créditos aplicáveis
#### Cálculo mensal do carnê-leão
Base mensal = soma das rendas estrangeiras tributáveis do mês - deduções mensais
Imposto mensal = base mensal × alíquota aplicável
#### Cálculo de ganho de capital
Ganho de capital = valor de venda - custo de aquisição - custos/despesas permitidas
Imposto sobre ganho de capital = ganho de capital × alíquota de ganho de capital
#### Cálculo com imposto pago no exterior
Imposto líquido estimado = imposto brasileiro apurado - crédito tributário aproveitável

#### Validações
- O sistema não deve calcular imposto para eventos classificados como não tributáveis.
- O sistema não deve aplicar deduções não elegíveis.
- A base de cálculo não pode ser negativa.
- O imposto calculado não pode ser negativo.
- Rendas em moeda estrangeira devem ser convertidas antes do cálculo em reais.
- Todo cálculo deve guardar a versão da regra utilizada.
- Todo cálculo deve guardar a data de execução.
- Todo cálculo deve possuir rastreabilidade até a renda ou evento original.
- Quando faltar informação essencial, o cálculo deve ser marcado como incompleto.
- Cálculos de casos complexos devem ser marcados para revisão.
#### Campos sugeridos no banco de dados
TaxCalculation
- id
- user_id
- tax_year
- calculation_type
- gross_income
- deductions_total
- exemptions_total
- taxable_base
- applied_rate
- gross_tax
- foreign_tax_paid
- tax_credit_applied
- net_tax_due
- currency
- rule_version
- calculation_status
- requires_additional_review
- created_at
- updated_at
TaxCalculationItem
- id
- tax_calculation_id
- source_event_id
- income_source_id
- calculation_module
- gross_amount
- deductions
- exemptions
- taxable_base
- applied_rate
- calculated_tax
- foreign_tax_paid
- tax_credit_applied
- net_tax_due
- notes
### RF-006 — Aplicação de deduções
#### Descrição
O sistema deve identificar, validar e aplicar deduções tributárias elegíveis antes do cálculo final do imposto.
As deduções reduzem a base de cálculo e, consequentemente, podem reduzir o imposto estimado a pagar.
#### Objetivo
Permitir que o sistema considere oportunidades tributárias legais, como:
    - deduções pessoais;
    - deduções por dependentes;
    - despesas médicas;
    - contribuições previdenciárias;
    - despesas permitidas em ganho de capital;
    - benefícios aplicáveis conforme o perfil do usuário.
#### Tipos de deduções suportadas
1. Deduções pessoais
    - Dependentes
    - Previdência privada
    - Previdência oficial
    - Pensão alimentícia
    - Despesas médicas
    - Despesas educacionais, se aplicável
2. Deduções relacionadas à renda
    - Imposto pago no exterior, quando tratado como crédito ou abatimento permitido
    - Custos necessários para obtenção da renda
    - Despesas relacionadas a aluguel
    - Encargos associados ao recebimento de renda
3. Deduções relacionadas a ganho de capital
    - Custo de aquisição do bem
    - Custos de corretagem
    - Despesas de venda
    - Melhorias comprovadas em imóvel
    - Taxas cartorárias
    - Comissões
4. Deduções específicas para estruturas complexas
    - Custos administrativos de trust, quando aplicável
    - Taxas de gestão
    - Custos relacionados a ativos offshore
    - Impostos pagos na jurisdição de origem
#### Dados de entrada necessários
Para aplicar deduções, o sistema deve coletar:
    - tipo da dedução;
    - valor da dedução;
    - data da despesa;
    - país onde a despesa ocorreu;
    - moeda;
    - comprovante, se disponível;
    - relação com uma renda ou evento tributável;
    - categoria fiscal da dedução;
    - se a dedução é recorrente ou pontual;
    - se já foi utilizada em outro cálculo;
    - observações do usuário.
#### Regras associadas
**RN-001 — Dedução reduz base de cálculo**
Toda dedução elegível deve reduzir a base de cálculo antes da aplicação da alíquota.
Base tributável = renda bruta - deduções elegíveis - isenções
**RN-002 — Dedução deve estar vinculada a uma regra válida**
O sistema não deve aplicar automaticamente uma dedução se ela não estiver associada a uma regra tributária cadastrada.
**RN-003 — Dedução dependente de comprovação**
Quando uma dedução exigir comprovante, o sistema deve permitir o cadastro do documento e marcar a dedução como pendente caso ele não seja informado.
**RN-004 — Dedução por período**
A dedução deve ser aplicada ao período correto:
    - mensal, quando vinculada ao carnê-leão;
    - anual, quando vinculada ao ajuste anual;
    - por transação, quando vinculada a ganho de capital.
**RN-005 — Dedução em moeda estrangeira**
Se a dedução estiver em moeda estrangeira, o sistema deve convertê-la para reais usando a taxa de câmbio correspondente ao período definido pela regra.
**RN-006 — Dedução não pode gerar base negativa**
A aplicação de deduções não deve tornar a base tributável negativa.
Se isso ocorrer, a base deve ser limitada a zero.
**RN-007 — Deduções em casos complexos**
Deduções vinculadas a trust, RSU, offshore ou dupla residência fiscal devem ser marcadas como “requer revisão” quando não houver regra clara.
#### Fluxo esperado
1. Usuário informa despesas ou deduções possíveis.
2. Sistema classifica a dedução por tipo.
3. Sistema verifica se existe regra aplicável.
4. Sistema valida elegibilidade da dedução.
5. Sistema verifica período de aplicação.
6. Sistema converte moeda, se necessário.
7. Sistema aplica a dedução na base de cálculo correta.
8. Sistema registra rastreabilidade da dedução.
9. Sistema exibe o impacto da dedução no cálculo final.
#### Validações
- Toda dedução deve possuir tipo.
- Toda dedução deve possuir valor.
- Valor da dedução não pode ser negativo.
- Dedução deve estar vinculada a um usuário.
- Dedução pode estar vinculada a uma renda, evento ou ativo.
- Dedução deve possuir período fiscal.
- Dedução em moeda estrangeira deve possuir taxa de conversão.
- Dedução já utilizada não deve ser aplicada novamente.
- Dedução sem regra associada deve ficar pendente.
- Dedução com dados incompletos não deve ser aplicada automaticamente.
- Deduções aplicadas devem ser rastreáveis no cálculo final.
#### Campos sugeridos no banco de dados
Deduction
- id
- user_id
- deduction_type
- related_income_id
- related_event_id
- related_asset_id
- amount
- currency
- exchange_rate
- amount_brl
- tax_period
- application_scope
- is_recurring
- is_eligible
- requires_proof
- proof_document_url
- proof_status
- applied_amount
- application_status
- requires_additional_review
- rule_version
- created_at
- updated_at
#### Observações importantes
A aplicação de deduções deve ser parametrizável, pois as regras podem mudar com frequência.
O sistema não deve “hardcodar” todas as deduções diretamente no código-fonte. O ideal é manter uma tabela ou motor de regras com:
    - tipo da dedução;
    - limite aplicável;
    - período fiscal;
    - país aplicável;
    - documentos exigidos;
    - regra de elegibilidade;
    - versão da regra.
### RF-007 — Cadastro de patrimônio
#### Descrição
O sistema deve permitir que o usuário cadastre seus bens, ativos e direitos patrimoniais, localizados no Brasil, nos Estados Unidos ou em outros países.
Essas informações serão usadas para identificar possíveis eventos tributáveis relacionados a patrimônio, como:
    - aquisição de bens;
    - venda de bens;
    - transferência de patrimônio;
    - ganho de capital;
    - herança;
    - doação;
    - incidência de tributos patrimoniais.
#### Objetivo
Permitir que o sistema compreenda a composição patrimonial do usuário para:
    - calcular ganho de capital em vendas futuras;
    - identificar acréscimo patrimonial;
    - avaliar riscos ou obrigações fiscais;
    - cruzar patrimônio com renda declarada;
    - simular cenários de tributação;
    - analisar estruturas como trusts e holdings;
    - consolidar visão patrimonial Brasil–EUA.
Tipos de patrimônio suportados
1. Imóveis
- Casa
- Apartamento
- Terreno
- Imóvel comercial
- Imóvel rural
- Imóvel no exterior
2. Veículos
- Carro
- Moto
- Barco
- Aeronave
- Veículo no exterior
3. Ativos financeiros
- Conta bancária
- Conta de investimento
- Ações
- ETFs
- Fundos
- Bonds
- Criptoativos
- Participações em empresas
4. Participações societárias
- Cotas de empresa brasileira
- Cotas de empresa estrangeira
- LLC
- Corporation
- Holding
- Partnership
5. Estruturas internacionais
- Trust
- Fundação
- Entidade offshore
- Conta de aposentadoria estrangeira
- 401(k)
- Roth 401(k)
- IRA
- Roth IRA
6. Outros bens e direitos
- Obras de arte
- Joias
- Propriedade intelectual
- Direitos autorais
- Créditos a receber
- Contratos com valor econômico
Dados a serem coletados por patrimônio
Para cada bem ou ativo, o sistema deve coletar:
    - tipo do patrimônio;
    - descrição;
    - país onde o patrimônio está localizado;
    - moeda;
    - valor de aquisição;
    - data de aquisição;
    - valor atual estimado;
    - titularidade;
    - percentual de participação;
    - forma de aquisição:
    - compra;
    - doação;
    - herança;
    - transferência;
    - integralização;
    - distribuição;
    - origem dos recursos utilizados para aquisição;
    - se há financiamento;
    - se há coproprietários;
    - se o bem gera renda;
    - se o bem já foi vendido ou transferido;
    - documentos comprobatórios;
    - observações adicionais.
#### Regras associadas
**RN-001 — Patrimônio não gera imposto automaticamente**
O simples cadastro de um bem não deve gerar imposto automaticamente. O sistema deve apenas registrar o ativo e monitorar eventos futuros.
**RN-002 — Aquisição patrimonial pode indicar acréscimo patrimonial**
Se o usuário cadastrar aquisição de patrimônio incompatível com renda declarada, o sistema deve marcar o caso como possível inconsistência.
**RN-003 — Venda de patrimônio pode gerar ganho de capital**
Se o usuário vender um bem por valor superior ao custo de aquisição ajustado, o sistema deve gerar evento de ganho de capital.
Ganho de capital = valor de venda - custo de aquisição ajustado
**RN-004 — Transferência de patrimônio pode ser evento tributável**
Se houver transferência de titularidade de bem ou direito, o sistema deve classificar o evento como potencialmente tributável, dependendo da natureza da transferência.
**RN-005 — Patrimônio no exterior**
Se o usuário for residente fiscal no Brasil e possuir patrimônio no exterior, o sistema deve registrar esse bem como patrimônio estrangeiro e marcá-lo para análise em obrigações internacionais.
**RN-006 — Patrimônio que gera renda**
Se o patrimônio gera renda, como aluguel, dividendos ou juros, o sistema deve vincular esse ativo a uma fonte de renda no RF-002.
**RN-007 — Patrimônio vinculado a trust**
Se o patrimônio estiver dentro de um trust, o sistema deve vincular o ativo à estrutura do trust e aplicar regras específicas.
**RN-008 — Tributos patrimoniais**
O sistema deve permitir o registro de tributos relacionados ao patrimônio, como:
    - IPTU;
    - IPVA;
    - property tax;
    - taxas de manutenção;
    - tributos locais.
#### Fluxo esperado
1. Usuário acessa o módulo de patrimônio.
2. Sistema pergunta se possui bens no Brasil, EUA ou outro país.
3. Usuário adiciona um ou mais ativos.
4. Para cada ativo, o sistema solicita:
    - tipo;
    - país;
    - valor;
    - data de aquisição;
    - titularidade;
    - forma de aquisição.
5. Sistema classifica o patrimônio.
6. Sistema identifica se o ativo gera renda.
7. Sistema identifica se está vinculado a trust, offshore ou empresa.
8. Sistema armazena o ativo.
9. Sistema marca possíveis riscos, obrigações ou eventos futuros.
#### Validações
- Todo patrimônio deve ter tipo.
- Todo patrimônio deve ter país de localização.
- Valor de aquisição deve ser obrigatório quando disponível.
- Data de aquisição deve ser obrigatória para cálculo futuro de ganho de capital.
- Valor atual não pode ser negativo.
- Percentual de titularidade deve estar entre 0% e 100%.
- Se houver coproprietários, o percentual total não deve exceder 100%.
- Se o ativo gerar renda, deve haver vínculo com uma fonte de renda.
- Se o ativo for vendido, deve haver data e valor de venda.
- Patrimônio no exterior deve ter moeda original.
- Patrimônio vinculado a trust deve exigir dados adicionais.
- O sistema deve evitar duplicidade evidente de ativos.
#### Campos sugeridos no banco de dados
Asset
- id
- user_id
- asset_type
- description
- country
- currency
- acquisition_value
- acquisition_date
- current_estimated_value
- ownership_percentage
- acquisition_method
- funding_source
- has_financing
- financing_amount
- has_coowners
- generates_income
- linked_income_source_id
- linked_trust_id
- linked_company_id
- is_foreign_asset
- requires_capital_gain_tracking
- requires_additional_review
- supporting_document_url
- status
- created_at
- updated_at
Impacto no cálculo tributário
O cadastro de patrimônio deve alimentar outros módulos do sistema:
1. Ganho de capital
Quando houver venda de ativo:
Ganho de capital = valor de venda - custo de aquisição ajustado - despesas permitidas
2. Renda patrimonial
Quando o bem gerar renda:
    - aluguel;
    - juros;
    - dividendos;
    - distribuição;
    - royalties.
3. Tributos patrimoniais
O sistema deve permitir registrar ou estimar:
    - IPTU;
    - IPVA;
    - property tax;
    - taxas locais.
4. Análise internacional
Patrimônio no exterior pode impactar:
    - declaração de bens;
    - crédito tributário;
    - sucessão;
    - trust;
    - herança;
    - planejamento patrimonial.
#### Observações importantes
O cadastro de patrimônio não deve ser tratado apenas como inventário de bens. Ele deve funcionar como base para identificar eventos tributários futuros.
#### Exemplo:
- comprar um imóvel pode não gerar imposto imediato;
- receber um imóvel por herança pode gerar obrigação tributária;
- vender um imóvel com lucro pode gerar ganho de capital;
- transferir cotas sociais pode gerar tributação;
- possuir patrimônio dentro de trust pode mudar completamente o tratamento fiscal.
### RF-008 — Identificação de transferências internacionais
#### Descrição
O sistema deve permitir o registro e a identificação de transferências internacionais de valores entre contas, instituições financeiras, países ou estruturas patrimoniais, classificando cada transferência conforme sua natureza tributária.
O objetivo principal é diferenciar uma simples movimentação financeira de um evento que representa renda, acréscimo patrimonial, distribuição, pagamento ou transferência tributável.
#### Objetivo
Permitir que o sistema identifique:
    - se houve apenas movimentação entre contas próprias;
    - se a transferência representa renda recebida do exterior;
    - se a transferência tem origem em salário, aposentadoria, trust, dividendos ou investimento;
    - se há obrigação de declarar via carnê-leão;
    - se houve imposto pago ou retido no exterior;
    - se a transferência gera necessidade de análise de crédito tributário;
    - se a transferência está associada a patrimônio, offshore ou trust.
Tipos de transferências suportadas
1. Transferência entre contas próprias
Transferência de uma conta do próprio usuário no exterior para uma conta própria no Brasil, ou vice-versa.
#### Exemplo:
- conta pessoal nos EUA → conta pessoal no Brasil.
Esse tipo de transferência, isoladamente, não deve ser tratado como renda tributável, desde que não represente recebimento novo de renda.
2. Transferência de renda estrangeira
Transferência de valores recebidos no exterior como renda, posteriormente enviados ao Brasil.
#### Exemplos:
- salário recebido nos EUA e enviado ao Brasil;
- aposentadoria americana transferida para conta brasileira;
- dividendos recebidos no exterior e remetidos ao Brasil.
Nesse caso, o fato gerador não é necessariamente a transferência em si, mas a origem econômica do valor recebido.
3. Transferência de patrimônio
Transferência relacionada a bens, ativos, cotas sociais ou direitos patrimoniais.
#### Exemplos:
- transferência de cotas societárias;
- remessa decorrente de venda de imóvel;
- transferência de valores por doação;
- transferência por herança;
- liquidação de ativo no exterior.
4. Transferência vinculada a trust
Transferência recebida de trust, fundação, entidade offshore ou estrutura similar.
Esse caso deve ser tratado como complexo, pois o tratamento tributário depende das características da estrutura, como:
    - trust revogável ou irrevogável;
    - controle do beneficiário;
    - frequência dos pagamentos;
    - jurisdição;
    - cláusulas de proteção;
    - titularidade dos ativos.
5. Transferência entre terceiros
Transferência enviada por pessoa, empresa ou entidade de titularidade diferente da do usuário.
#### Exemplos:
- empresa estrangeira pagando o usuário;
- trust pagando beneficiário;
- familiar enviando recursos;
- comprador estrangeiro pagando pela aquisição de ativo.
Esse tipo de transferência deve exigir identificação da origem e da natureza econômica.
Dados a serem coletados
Para cada transferência internacional, o sistema deve coletar:
    - país de origem;
    - país de destino;
    - moeda de origem;
    - moeda de destino;
    - valor original;
    - valor convertido;
    - data da transferência;
    - taxa de câmbio utilizada;
    - instituição financeira de origem;
    - instituição financeira de destino;
    - titular da conta de origem;
    - titular da conta de destino;
    - se as contas são de mesma titularidade;
    - motivo da transferência;
    - origem econômica dos recursos;
    - se o valor corresponde a renda, patrimônio ou simples remessa;
    - se houve imposto pago ou retido no exterior;
    - se há comprovante bancário;
    - se há contrato, invoice, holerite, informe ou documento de suporte;
    - se o valor já foi declarado anteriormente;
    - se a transferência está vinculada a renda cadastrada;
    - se a transferência está vinculada a ativo patrimonial;
    - se a transferência está vinculada a trust ou entidade offshore.
Classificações possíveis
O sistema deve classificar a transferência como uma das seguintes categorias:
    - transferência entre contas próprias;
    - renda estrangeira transferida;
    - distribuição de investimento;
    - distribuição de trust;
    - venda de ativo;
    - ganho de capital;
    - doação;
    - herança;
    - pagamento por serviço;
    - salário;
    - aposentadoria;
    - pensão;
    - dividendo;
    - remessa patrimonial;
    - transferência societária;
    - transferência não tributável;
    - transferência potencialmente tributável;
    - transferência pendente de análise;
    - caso complexo.
#### Regras associadas
**RN-001 — Transferência entre contas próprias**
Se a conta de origem e a conta de destino forem de mesma titularidade, e não houver novo acréscimo patrimonial, o sistema deve classificar a operação como transferência própria não tributável.
**RN-002 — Transferência não define tributação isoladamente**
O sistema não deve considerar a transferência internacional como fato gerador automaticamente. A tributação deve ser determinada pela origem econômica do valor transferido.
**RN-003 — Renda estrangeira**
Se o valor transferido corresponder a renda recebida no exterior por residente fiscal no Brasil, o sistema deve marcar a operação como renda estrangeira potencialmente tributável.
**RN-004 — Carnê-leão**
Se a transferência estiver vinculada a renda estrangeira recebida por pessoa física residente fiscal no Brasil, o sistema deve encaminhar o valor ao módulo de carnê-leão, conforme o período de recebimento da renda.
**RN-005 — Imposto pago no exterior**
Se houver imposto pago ou retido no exterior, o sistema deve armazenar a informação para análise de crédito tributário internacional.
**RN-006 — Transferência patrimonial**
Se a transferência estiver associada à venda, doação, herança ou transferência de bem, o sistema deve encaminhar o evento para análise patrimonial ou ganho de capital.
**RN-007 — Trust ou offshore**
Se a transferência tiver origem em trust, offshore ou estrutura estrangeira, o sistema deve marcar o caso como complexo e exigir informações adicionais.
**RN-008 — Transferência de salário**
Se a transferência estiver associada a salário recebido no exterior, o sistema deve classificar como renda de trabalho estrangeira.
**RN-009 — Transferência de aposentadoria ou pensão**
Se a transferência estiver associada a aposentadoria, pensão, Social Security ou conta previdenciária estrangeira, o sistema deve classificar como renda previdenciária estrangeira.
**RN-010 — Transferência sem documentação suficiente**
Se o usuário não informar origem econômica, titularidade ou documentos mínimos, o sistema deve classificar a transferência como pendente de análise.
#### Fluxo esperado
1. Usuário acessa o módulo de transferências internacionais.
2. Sistema solicita país de origem, país de destino, valor, moeda e data.
3. Sistema pergunta se as contas são de mesma titularidade.
4. Sistema solicita a origem econômica do recurso.
5. Sistema verifica se a transferência está vinculada a:
    - fonte de renda;
    - ativo patrimonial;
    - trust;
    - offshore;
    - empresa;
    - terceiro.
6. Sistema verifica residência fiscal do usuário.
7. Sistema classifica a transferência.
8. Sistema determina se a transferência deve:
    - ser ignorada para fins de cálculo;
    - ser registrada apenas como movimentação;
    - gerar evento tributável;
    - alimentar o módulo de carnê-leão;
    - alimentar o módulo de ganho de capital;
    - alimentar análise de trust/offshore;
    - alimentar análise de crédito tributário.
9. Sistema registra a classificação e mantém rastreabilidade com os dados de origem.
#### Validações
- País de origem deve ser obrigatório.
- País de destino deve ser obrigatório.
- Valor da transferência deve ser obrigatório e maior que zero.
- Moeda de origem deve ser obrigatória.
- Data da transferência deve ser obrigatória.
- O sistema deve solicitar taxa de câmbio quando houver conversão de moeda.
- Titularidade da conta de origem e destino deve ser informada.
- Se a transferência for entre contas próprias, deve haver confirmação de mesma titularidade.
- Se a origem econômica for renda, deve haver vínculo com uma fonte de renda ou cadastro de nova fonte.
- Se a origem econômica for venda de ativo, deve haver vínculo com patrimônio ou transação.
- Se a origem for trust/offshore, o sistema deve exigir informações adicionais.
- Transferências sem origem econômica definida devem ficar pendentes.
- Transferências não devem ser duplicadas quando importadas de extratos ou APIs.
- O sistema deve permitir anexar documentos comprobatórios.
#### Campos sugeridos no banco de dados
InternationalTransfer
- id
- user_id
- origin_country
- destination_country
- origin_currency
- destination_currency
- original_amount
- converted_amount
- exchange_rate
- transfer_date
- origin_bank
- destination_bank
- origin_account_holder
- destination_account_holder
- same_ownership
- transfer_reason
- economic_origin
- linked_income_source_id
- linked_asset_id
- linked_trust_id
- linked_company_id
- foreign_tax_paid
- tax_withheld
- supporting_document_url
- classification
- tax_treatment
- requires_carne_leao
- requires_capital_gain
- requires_tax_credit_analysis
- requires_trust_analysis
- requires_additional_review
- created_at
- updated_at
#### Observações importantes
A identificação de transferências internacionais é crítica porque nem toda entrada de dinheiro do exterior representa renda nova.
Exemplo importante:
    - transferir dinheiro da própria conta nos EUA para a própria conta no Brasil não deve gerar imposto por si só;
    - receber salário nos EUA e depois transferir para o Brasil deve ser tratado como renda estrangeira;
    - receber distribuição de trust exige análise específica;
    - vender um ativo no exterior e transferir o dinheiro pode gerar ganho de capital.
Portanto, o sistema deve sempre separar:
movimentação financeira de fato gerador tributário.
### RF-009 — Cadastro de trust
#### Descrição
O sistema deve permitir o cadastro detalhado de estruturas do tipo trust, incluindo suas características jurídicas, operacionais e econômicas, para possibilitar a correta análise tributária conforme o contexto Brasil–Estados Unidos.
Esse requisito é necessário porque, conforme a transcrição, o tratamento tributário de trusts varia significativamente dependendo de fatores como controle, irrevogabilidade, jurisdição e forma de distribuição de recursos.
#### Objetivo
Permitir que o sistema capture informações suficientes para:
    - identificar se o trust é potencialmente tributável no Brasil;
    - diferenciar trust revogável de irrevogável;
    - entender se há controle por parte do beneficiário;
    - identificar se há distribuição de renda ou apenas acumulação;
    - avaliar se existe conflito de jurisdição;
    - classificar corretamente eventos relacionados ao trust;
    - direcionar os dados para o motor de regras tributárias;
    - sinalizar casos complexos que exigem análise especializada.
Tipos de trust suportados
O sistema deve suportar o cadastro de diferentes tipos de trust, incluindo:
    - trust revogável;
    - trust irrevogável;
    - trust discricionário;
    - trust não discricionário;
    - trust com distribuição periódica;
    - trust com acumulação de patrimônio;
    - trust com controle do beneficiário;
    - trust com controle de terceiro (trustee independente);
    - trust com cláusulas de proteção (firewall clauses);
    - trust com jurisdição exclusiva estrangeira.
Dados a serem coletados
Para cada trust, o sistema deve coletar:
    - nome do trust;
    - país de constituição;
    - jurisdição aplicável;
    - data de criação;
    - tipo de trust (revogável ou irrevogável);
    - descrição geral da estrutura;
    - quem é o instituidor (settlor);
    - quem é o trustee;
    - quem são os beneficiários;
    - se o usuário é beneficiário;
    - se o usuário possui controle sobre o trust;
    - nível de controle do usuário;
    - se o trust permite reversão de titularidade;
    - se há distribuição de rendimentos;
    - frequência das distribuições (mensal, anual, eventual);
    - se há acumulação de patrimônio dentro do trust;
    - tipo de ativos mantidos no trust;
    - valor estimado do patrimônio;
    - se há cláusulas de proteção de jurisdição (firewall clauses);
    - se há exclusividade de jurisdição estrangeira;
    - se o trust já realizou pagamentos ao usuário;
    - valores recebidos pelo usuário;
    - se houve tributação no exterior;
    - documentos relacionados ao trust (instrumento, contratos, etc.);
    - observações adicionais.
#### Regras associadas
**RN-001 — Trust irrevogável sem controle**
Se o trust for irrevogável, não permitir reversão de titularidade e o usuário não possuir controle sobre a gestão ou ativos, o sistema deve marcar como potencialmente não tributável no Brasil, conforme entendimento prático.
**RN-002 — Trust com controle do beneficiário**
Se o usuário possuir controle sobre o trust, direta ou indiretamente, o sistema deve classificar a estrutura como potencialmente tributável.
**RN-003 — Trust com distribuição de rendimentos**
Se houver distribuição de valores ao usuário, o sistema deve tratar esses valores como renda potencialmente tributável.
**RN-004 — Trust com acumulação de patrimônio**
Se o trust acumular patrimônio sem distribuição, o sistema deve avaliar se há incidência tributária ou apenas monitoramento patrimonial.
**RN-005 — Trust com jurisdição estrangeira exclusiva**
Se o trust possuir cláusulas de jurisdição exclusiva estrangeira (ex: firewall clauses), o sistema deve marcar o caso como de difícil execução fiscal no Brasil e classificar como caso complexo.
**RN-006 — Trust não reconhecido juridicamente no Brasil**
Como o trust não é uma figura plenamente reconhecida no ordenamento brasileiro, o sistema deve tratar todos os casos como dependentes de interpretação, exigindo análise contextual.
**RN-007 — Pagamentos recorrentes**
Se o trust realiza pagamentos recorrentes ao usuário, o sistema deve classificar como renda periódica e encaminhar ao módulo de cálculo correspondente.
**RN-008 — Falta de informações**
Se informações críticas não forem fornecidas (controle, tipo de trust, distribuição), o sistema deve classificar o cadastro como incompleto e exigir complementação.
#### Fluxo esperado
1. Usuário acessa o módulo de estruturas internacionais.
2. Sistema pergunta se o usuário possui trust.
3. Usuário inicia cadastro do trust.
4. Sistema solicita dados estruturais e jurídicos.
5. Sistema pergunta sobre controle e titularidade.
6. Sistema coleta informações sobre distribuição e acumulação.
7. Sistema coleta informações sobre jurisdição e cláusulas de proteção.
8. Sistema coleta dados financeiros e patrimoniais.
9. Sistema valida informações obrigatórias.
10. Sistema classifica o trust com base nas regras.
11. Sistema marca o nível de complexidade.
12. Sistema vincula o trust a rendas, ativos e transferências, quando aplicável.
#### Validações
- Tipo de trust deve ser obrigatório.
- País de constituição deve ser obrigatório.
- Deve ser informado se o trust é revogável ou irrevogável.
- Deve ser informado se o usuário possui controle.
- Deve ser informado se há distribuição de rendimentos.
- Deve ser informado se há acumulação de patrimônio.
- Deve ser informado se há beneficiários.
- Deve ser informado se o usuário é beneficiário.
- Deve ser informado se há jurisdição exclusiva estrangeira.
- Deve ser informado se existem cláusulas de proteção.
- Trust com distribuição deve ter valores associados ou histórico.
- Trust com ativos deve ter valor estimado.
- Dados inconsistentes devem ser sinalizados.
- Cadastros incompletos devem ser marcados como pendentes.
#### Campos sugeridos no banco de dados
Trust
- id
- user_id
- name
- country_of_origin
- jurisdiction
- creation_date
- trust_type
- is_revocable
- description
- settlor_name
- trustee_name
- beneficiaries
- is_user_beneficiary
- user_control_level
- has_control
- allows_reversal
- distributes_income
- distribution_frequency
- accumulates_wealth
- asset_types
- estimated_asset_value
- has_firewall_clauses
- exclusive_foreign_jurisdiction
- payments_received
- total_amount_received
- foreign_tax_paid
- supporting_document_url
- classification
- requires_additional_review
- status
- created_at
- updated_at
#### Observações importantes
O cadastro de trust é um dos pontos mais complexos do sistema, pois depende de múltiplos fatores subjetivos e jurídicos.
Pequenas variações na estrutura podem alterar completamente o tratamento tributário.
#### Exemplo:
- trust irrevogável sem controle pode não ser tributado na prática;
- trust com controle ou distribuição pode gerar tributação;
- trust com proteção jurídica forte pode ser difícil de alcançar pelo fisco;
- trust com pagamentos recorrentes pode ser tratado como renda regular.
Por isso, o sistema deve priorizar:
    - coleta detalhada de informações;
    - classificação baseada em regras flexíveis;
    - sinalização de incertezas;
    - rastreabilidade das decisões.
### RF-010 — Diferenciação de trust revogável e irrevogável
#### Descrição
O sistema deve identificar e classificar corretamente se um trust é revogável ou irrevogável, com base nas características informadas no cadastro, determinando o impacto dessa classificação no tratamento tributário.
Essa diferenciação é crítica porque, conforme descrito na transcrição, o grau de controle e a possibilidade de reversão da titularidade do patrimônio são fatores determinantes para a incidência ou não de tributação.
#### Objetivo
Permitir que o sistema:
    - identifique se o trust pode ser alterado ou desfeito pelo instituidor (settlor);
    - determine se há transferência efetiva de titularidade do patrimônio;
    - avaliar o nível de controle do usuário sobre os ativos;
    - classificar corretamente o trust para fins tributários;
    - direcionar o trust para o tratamento fiscal adequado;
    - reduzir ambiguidades na análise de estruturas internacionais.
Definições operacionais
Trust revogável
É aquele em que o instituidor mantém o poder de alterar, modificar ou extinguir o trust, podendo recuperar o patrimônio transferido.
Trust irrevogável
É aquele em que o instituidor não possui mais controle sobre o patrimônio, não podendo reverter a titularidade nem alterar a estrutura após sua constituição.
Dados necessários para diferenciação
O sistema deve coletar ou derivar:
    - se o trust pode ser alterado após sua criação;
    - se o instituidor pode recuperar os ativos;
    - se o usuário possui controle direto ou indireto;
    - se existe poder de substituição do trustee;
    - se há cláusulas que permitem modificação do trust;
    - se o trust possui cláusulas de irrevogabilidade formal;
    - se há dependência de autorização judicial para alterações;
    - nível de independência do trustee;
    - existência de cláusulas de proteção (firewall clauses);
    - existência de jurisdição exclusiva estrangeira;
    - descrição textual do instrumento do trust (quando disponível);
    - documentação comprobatória.
#### Regras associadas
**RN-001 — Identificação explícita**
Se o usuário indicar explicitamente que o trust é revogável ou irrevogável, o sistema deve utilizar essa informação como base inicial, sujeita a validação.
**RN-002 — Poder de reversão**
Se o instituidor ou usuário puder recuperar o patrimônio ou extinguir o trust unilateralmente, o sistema deve classificar como revogável.
**RN-003 — Ausência de controle**
Se não houver possibilidade de reversão e o controle estiver integralmente com terceiro independente, o sistema deve classificar como irrevogável.
**RN-004 — Controle indireto**
Se o usuário possuir controle indireto relevante (ex: influência sobre trustee, poder de decisão sobre ativos), o sistema deve considerar o trust como potencialmente revogável ou equivalente para fins tributários.
**RN-005 — Cláusulas contratuais**
Se o instrumento do trust contiver cláusulas que permitam alteração, substituição de partes ou reversão de ativos, o sistema deve classificar como revogável.
**RN-006 — Inconsistência de dados**
Se houver conflito entre informações fornecidas (ex: marcado como irrevogável, mas com poder de reversão), o sistema deve marcar como classificação inconsistente.
**RN-007 — Falta de informação**
Se não houver dados suficientes para determinar a natureza do trust, o sistema deve classificar como “indeterminado” e exigir complementação.
**RN-008 — Impacto tributário**
Trusts classificados como revogáveis devem ser considerados, por padrão, mais propensos à tributação.
Trusts classificados como irrevogáveis podem ser considerados potencialmente não tributáveis em determinados cenários, dependendo de outras variáveis.
#### Fluxo esperado
1. Sistema recebe dados do cadastro de trust (RF-009).
2. Sistema verifica se há indicação explícita de revogabilidade.
3. Sistema analisa critérios objetivos:
    - possibilidade de reversão;
    - nível de controle;
    - cláusulas contratuais;
    - papel do trustee.
4. Sistema cruza as informações fornecidas.
5. Sistema aplica regras de classificação.
6. Sistema define o status:
    - revogável;
    - irrevogável;
    - potencialmente revogável;
    - indeterminado;
    - inconsistente.
7. Sistema registra a justificativa da classificação.
8. Sistema vincula a classificação ao motor de cálculo e regras tributárias.
9. Sistema marca casos ambíguos como “requer revisão”.
#### Validações
- Deve ser obrigatório informar se há possibilidade de alteração do trust.
- Deve ser obrigatório informar se há possibilidade de reversão de ativos.
- Deve ser obrigatório informar se o usuário possui controle sobre o trust.
- Informações conflitantes devem ser detectadas automaticamente.
- Trust sem dados mínimos não deve ser classificado automaticamente.
- Trust classificado como irrevogável deve ter ausência comprovada de controle e reversibilidade.
- Trust classificado como revogável deve possuir evidência de controle ou reversão.
- O sistema deve registrar a origem da classificação (entrada do usuário ou inferência do sistema).
- Toda classificação deve ser rastreável e auditável.
#### Campos sugeridos no banco de dados
TrustClassification
- id
- trust_id
- user_id
- is_revocable_declared
- is_irrevocable_declared
- allows_modification
- allows_reversal
- user_has_control
- control_level
- trustee_independence_level
- has_firewall_clauses
- has_exclusive_foreign_jurisdiction
- classification_result
- classification_confidence
- classification_reason
- classification_source
- is_inconsistent
- requires_additional_review
- created_at
- updated_at
#### Observações importantes
A diferenciação entre trust revogável e irrevogável não é apenas uma classificação formal, mas uma interpretação baseada em múltiplos fatores.
#### Na prática:
- um trust formalmente irrevogável pode ser tratado como revogável se houver controle indireto;
- a ausência de controle é tão importante quanto a ausência de reversibilidade;
- cláusulas contratuais podem alterar completamente a análise;
- a jurisdição pode influenciar a capacidade de execução tributária.
Por isso, o sistema não deve depender exclusivamente de um campo binário, mas sim de uma análise composta que leve em consideração múltiplos atributos.
### RF-011 — Cálculo de ganho de capital
#### Descrição
O sistema deve calcular o ganho de capital obtido pelo usuário em operações de venda, alienação, transferência onerosa ou liquidação de ativos, considerando o custo de aquisição, valor de venda, despesas permitidas, moeda, país de localização do ativo e regras tributárias aplicáveis.
Esse requisito é necessário porque a transcrição menciona que ganho de capital possui um critério próprio de apuração, diferente da renda comum.
#### Objetivo
Permitir que o sistema:
    - identifique quando uma operação gera ganho de capital;
    - calcule o lucro obtido na venda ou alienação de um ativo;
    - diferencie ganho de capital de renda comum;
    - aplique regras específicas de apuração;
    - vincule o cálculo ao patrimônio cadastrado;
    - considere ativos no Brasil e no exterior;
    - trate operações em moeda estrangeira;
    - marque casos complexos para revisão.
Tipos de ativos suportados
O sistema deve suportar cálculo de ganho de capital para:
    - imóveis;
    - veículos;
    - ações;
    - ETFs;
    - fundos;
    - bonds;
    - criptoativos;
    - cotas societárias;
    - participação em empresas;
    - ativos mantidos no exterior;
    - ativos vinculados a trust;
    - propriedade intelectual;
    - outros bens e direitos com valor econômico.
Dados necessários para o cálculo
Para cada operação, o sistema deve coletar:
    - ativo vendido ou transferido;
    - tipo do ativo;
    - país onde o ativo está localizado;
    - moeda da operação;
    - data de aquisição;
    - valor de aquisição;
    - data de venda;
    - valor de venda;
    - percentual vendido;
    - custos de corretagem;
    - taxas de transação;
    - despesas de venda;
    - melhorias ou benfeitorias, quando aplicável;
    - imposto pago no exterior;
    - se houve recebimento em parcelas;
    - se o ativo estava em nome do usuário, empresa, trust ou terceiro;
    - se houve conversão cambial;
    - documentos de suporte;
    - observações adicionais.
#### Regras associadas
**RN-001 — Identificação de ganho de capital**
Se o valor de venda for maior que o custo de aquisição ajustado, o sistema deve identificar ganho de capital.
**RN-002 — Cálculo base**
O ganho de capital deve ser calculado pela diferença entre o valor de venda e o custo de aquisição ajustado.
Ganho de capital = valor de venda - custo de aquisição ajustado - despesas permitidas
**RN-003 — Custo de aquisição ajustado**
O custo de aquisição ajustado pode incluir despesas permitidas, como corretagem, taxas, melhorias comprovadas e custos diretamente relacionados ao ativo.
**RN-004 — Venda com prejuízo**
Se o valor de venda for menor ou igual ao custo de aquisição ajustado, o sistema não deve calcular imposto sobre ganho de capital, mas deve registrar a operação.
**RN-005 — Venda parcial**
Se apenas parte do ativo for vendida, o sistema deve calcular o custo proporcional da parte alienada.
Custo proporcional = custo total de aquisição × percentual vendido
**RN-006 — Ativo em moeda estrangeira**
Se o ativo estiver em moeda estrangeira, o sistema deve converter valores conforme a regra cambial aplicável ao período da aquisição e da venda.
**RN-007 — Ativo no exterior**
Se o usuário for residente fiscal no Brasil e vender ativo localizado no exterior, o sistema deve classificar a operação como ganho de capital internacional e marcar para análise de tributação brasileira e eventual crédito tributário.
**RN-008 — Imposto pago no exterior**
Se houver imposto pago no exterior sobre a operação, o sistema deve armazenar o valor para análise de crédito tributário internacional.
**RN-009 — Ativo vinculado a trust ou offshore**
Se o ativo estiver vinculado a trust, offshore ou estrutura estrangeira, o sistema deve classificar o cálculo como complexo e exigir revisão.
**RN-010 — Venda parcelada**
Se a venda ocorrer em parcelas, o sistema deve permitir registrar o cronograma de recebimento e calcular o impacto tributário conforme o período aplicável.
**RN-011 — Despesas não comprovadas**
Despesas sem comprovação devem ser registradas, mas não aplicadas automaticamente ao cálculo, salvo regra configurada.
**RN-012 — Rastreabilidade**
Todo cálculo de ganho de capital deve ser rastreável até o ativo original, os valores declarados e a versão da regra utilizada.
#### Fluxo esperado
1. Usuário informa que vendeu, transferiu ou liquidou um ativo.
2. Sistema solicita seleção ou cadastro do ativo.
3. Sistema recupera dados do patrimônio cadastrado.
4. Sistema solicita valor de venda, data da operação e moeda.
5. Sistema solicita custos e despesas relacionados.
6. Sistema verifica se houve imposto pago no exterior.
7. Sistema calcula o custo de aquisição ajustado.
8. Sistema calcula o ganho ou perda.
9. Sistema aplica a regra tributária correspondente.
10. Sistema marca a operação como nacional, internacional ou complexa.
11. Sistema registra o cálculo e vincula ao evento tributável.
#### Validações
- Ativo vendido deve estar cadastrado ou ser cadastrado durante o fluxo.
- Data de venda deve ser obrigatória.
- Valor de venda deve ser obrigatório e maior que zero.
- Valor de aquisição deve ser obrigatório para cálculo automático.
- Data de aquisição deve ser obrigatória.
- Percentual vendido deve estar entre 0% e 100%.
- Despesas aplicadas ao cálculo devem possuir tipo e valor.
- Despesas que exigem comprovação devem ter documento associado ou ficar pendentes.
- Valores em moeda estrangeira devem ter taxa de câmbio associada.
- O sistema não deve gerar imposto quando não houver ganho.
- O imposto calculado não pode ser negativo.
- Operações com trust, offshore ou titularidade indireta devem exigir revisão.
- Operações com dados insuficientes devem ficar incompletas ou pendentes.
#### Campos sugeridos no banco de dados
CapitalGainCalculation
- id
- user_id
- asset_id
- tax_event_id
- asset_type
- asset_country
- acquisition_date
- acquisition_value
- acquisition_currency
- acquisition_exchange_rate
- acquisition_value_brl
- sale_date
- sale_value
- sale_currency
- sale_exchange_rate
- sale_value_brl
- ownership_percentage_sold
- proportional_acquisition_cost
- deductible_expenses
- adjusted_cost_basis
- capital_gain_amount
- capital_loss_amount
- applied_tax_rate
- calculated_tax
- foreign_tax_paid
- tax_credit_analysis_required
- is_foreign_asset
- is_complex_case
- requires_additional_review
- rule_version
- calculation_status
- created_at
- updated_at
CapitalGainExpense
- id
- capital_gain_calculation_id
- expense_type
- amount
- currency
- exchange_rate
- amount_brl
- expense_date
- requires_proof
- proof_document_url
- is_applied
- status
- created_at
- updated_at
#### Observações importantes
O cálculo de ganho de capital deve ser separado do cálculo de renda comum, porque a lógica de apuração é diferente.
#### Exemplos:
- salário recebido do exterior é renda;
- venda de imóvel com lucro é ganho de capital;
- venda de ações com lucro é ganho de capital;
- transferência entre contas próprias não é ganho de capital;
- liquidação de ativo dentro de trust pode exigir análise complexa.
Esse requisito deve ser implementado com alta rastreabilidade, pois erros em custo de aquisição, câmbio ou despesas dedutíveis podem alterar significativamente o imposto calculado.
### RF-012 — Geração de relatório
#### Descrição
O sistema deve gerar relatórios consolidados e detalhados sobre a situação tributária do usuário, apresentando rendas, eventos tributáveis, cálculos realizados, deduções, isenções, créditos tributários, patrimônio e alertas relevantes.
O relatório deve funcionar como o principal resultado da plataforma, permitindo que o usuário entenda sua carga tributária estimada e os principais fatores que influenciaram o cálculo.
#### Objetivo
Permitir que o usuário visualize:
    - resumo da carga tributária estimada;
    - rendas cadastradas;
    - eventos tributáveis identificados;
    - impostos estimados;
    - deduções aplicadas;
    - isenções consideradas;
    - créditos tributários potenciais;
    - ganho de capital;
    - transferências internacionais;
    - patrimônio cadastrado;
    - casos complexos;
    - pendências de informação;
    - recomendações de revisão especializada.
Tipos de relatório
1. Relatório resumido
Deve apresentar uma visão geral da situação fiscal do usuário, incluindo:
    - imposto total estimado;
    - renda total considerada;
    - base tributável;
    - deduções totais;
    - isenções totais;
    - imposto pago no exterior;
    - saldo estimado a pagar;
    - número de pendências;
    - número de casos complexos.
2. Relatório detalhado
Deve apresentar o detalhamento completo por categoria:
    - renda nacional;
    - renda estrangeira;
    - carnê-leão;
    - ganho de capital;
    - trust;
    - transferências internacionais;
    - patrimônio;
    - deduções;
    - isenções;
    - crédito tributário;
    - casos pendentes.
3. Relatório mensal
Deve apresentar os valores agrupados por mês, especialmente para rendas estrangeiras sujeitas ao carnê-leão.
Deve incluir:
    - mês de referência;
    - renda estrangeira recebida;
    - deduções mensais;
    - base de cálculo mensal;
    - imposto estimado;
    - imposto pago no exterior;
    - saldo mensal estimado.
4. Relatório anual
Deve apresentar a consolidação do ano-calendário, incluindo:
    - renda anual total;
    - renda tributável;
    - renda isenta;
    - ganho de capital anual;
    - deduções anuais;
    - imposto anual estimado;
    - créditos tributários;
    - saldo estimado.
5. Relatório de inconsistências e pendências
Deve listar informações incompletas, casos ambíguos ou dados que impedem o cálculo correto.
#### Exemplos:
- renda sem país de origem;
- transferência sem origem econômica;
- trust sem informação de controle;
- ativo sem custo de aquisição;
- dedução sem comprovante;
- operação sem taxa de câmbio.
6. Relatório para especialista tributário
Deve organizar as informações em formato adequado para revisão por advogado, contador ou consultor tributário.
Deve conter:
    - dados do perfil fiscal;
    - premissas utilizadas;
    - regras aplicadas;
    - casos marcados para revisão;
    - documentos enviados;
    - rastreabilidade dos cálculos;
    - observações do usuário.
Dados utilizados no relatório
O relatório deve consolidar dados de:
    - cadastro do usuário;
    - residência fiscal;
    - fontes de renda;
    - classificações de renda;
    - eventos tributáveis;
    - transferências internacionais;
    - patrimônio;
    - trusts;
    - cálculos de imposto;
    - cálculos de ganho de capital;
    - deduções;
    - isenções;
    - créditos tributários;
    - documentos anexados;
    - pendências e inconsistências.
#### Regras associadas
**RN-001 — Relatório deve refletir dados processados**
O relatório deve ser gerado somente com base em dados previamente cadastrados, classificados e processados pelo sistema.
**RN-002 — Relatório deve indicar premissas**
O sistema deve exibir as premissas usadas no cálculo, como residência fiscal, ano-calendário, moeda de consolidação e regras aplicadas.
**RN-003 — Relatório deve destacar casos complexos**
Eventos envolvendo trust, offshore, RSU, dupla residência fiscal ou ausência de informações devem ser destacados como casos que exigem revisão.
**RN-004 — Relatório deve diferenciar valores calculados e estimados**
O sistema deve indicar claramente quando um valor é estimado, incompleto, pendente ou definitivo.
**RN-005 — Relatório deve apresentar rastreabilidade**
Cada cálculo apresentado deve permitir rastrear os dados que deram origem ao resultado.
**RN-006 — Relatório deve preservar histórico**
Relatórios gerados devem ser armazenados com data, versão e parâmetros utilizados.
**RN-007 — Relatório deve permitir exportação**
O sistema deve permitir exportar relatórios em formatos como PDF, Excel ou DOCX, conforme necessidade futura.
**RN-008 — Relatório deve respeitar permissões**
Relatórios fiscais devem ser acessíveis apenas pelo usuário autorizado ou profissional vinculado autorizado.
#### Fluxo esperado
1. Usuário solicita geração de relatório.
2. Sistema verifica se existem dados suficientes.
3. Sistema identifica pendências críticas.
4. Sistema consolida rendas, eventos, patrimônio e cálculos.
5. Sistema organiza os dados por categoria.
6. Sistema aplica formatação de resumo e detalhamento.
7. Sistema destaca alertas, pendências e casos complexos.
8. Sistema registra a versão do relatório.
9. Sistema disponibiliza visualização na plataforma.
10. Sistema permite exportação, quando habilitada.
#### Validações
- Relatório deve estar vinculado a um usuário.
- Relatório deve possuir período fiscal.
- Relatório deve possuir data de geração.
- Relatório deve indicar moeda de consolidação.
- Relatório deve indicar versão das regras utilizadas.
- Relatório não deve ocultar pendências relevantes.
- Relatório não deve apresentar cálculo como definitivo quando houver dados incompletos.
- Relatório deve indicar se há necessidade de revisão especializada.
- Relatório deve respeitar permissões de acesso.
- Relatório exportado deve preservar os mesmos dados da versão exibida na plataforma.
#### Campos sugeridos no banco de dados
TaxReport
- id
- user_id
- tax_year
- report_type
- report_status
- currency
- total_income
- taxable_income
- exempt_income
- total_deductions
- total_exemptions
- total_foreign_tax_paid
- total_estimated_tax
- total_tax_due
- pending_items_count
- complex_cases_count
- rule_version
- generated_at
- generated_by
- export_file_url
- created_at
- updated_at
TaxReportSection
- id
- report_id
- section_type
- title
- summary
- display_order
- has_pending_items
- has_complex_cases
- created_at
- updated_at
TaxReportItem
- id
- report_id
- section_id
- source_type
- source_id
- description
- amount
- currency
- tax_treatment
- calculation_status
- requires_review
- notes
- created_at
- updated_at
#### Observações importantes
O relatório não deve ser apenas uma tela final com o valor do imposto. Ele deve explicar o cálculo.
O usuário precisa entender:
    - o que foi considerado renda;
    - o que não foi considerado renda;
    - quais eventos geraram tributação;
    - quais deduções foram aplicadas;
    - quais informações ficaram pendentes;
    - quais pontos exigem revisão profissional.
Esse requisito é importante porque aumenta a transparência do sistema e reduz o risco de o usuário interpretar o cálculo como uma conclusão definitiva quando, na verdade, pode haver premissas ou casos complexos envolvidos.
### RF-013 — Simulação PF vs PJ
#### Descrição
O sistema deve permitir a simulação comparativa da carga tributária do usuário atuando como pessoa física (PF) versus uma estrutura de pessoa jurídica (PJ), considerando as rendas, patrimônio, eventos tributáveis e possíveis enquadramentos tributários.
Essa funcionalidade não deve recomendar automaticamente uma estrutura, mas sim fornecer uma análise comparativa para apoiar a tomada de decisão.
#### Objetivo
Permitir que o usuário visualize, de forma comparativa:
    - quanto pagaria de imposto como pessoa física;
    - quanto pagaria em uma estrutura de pessoa jurídica;
    - a diferença estimada de carga tributária;
    - quais rendas seriam tratadas de forma diferente em cada cenário;
    - impactos de distribuição de lucros, pró-labore e retenções;
    - possíveis oportunidades tributárias;
    - limitações e riscos de cada modelo.
#### Escopo da simulação
A simulação deve considerar dois cenários principais:
Cenário 1 — Pessoa Física (PF)
- aplicação de regras de imposto de renda pessoa física;
- tributação de renda nacional e estrangeira;
- aplicação de carnê-leão;
- ganho de capital;
- deduções e isenções;
- tributação direta sobre rendimentos.
Cenário 2 — Pessoa Jurídica (PJ)
- recebimento de rendas via empresa;
- separação entre faturamento da empresa e renda pessoal;
- tributação sobre faturamento ou lucro;
- distribuição de lucros;
- pró-labore;
- possível retenção na fonte;
- simulação simplificada de regimes tributários (sem detalhamento completo no MVP).
Dados necessários para simulação
O sistema deve utilizar:
    - dados do usuário (residência fiscal);
    - fontes de renda cadastradas;
    - classificação de renda;
    - eventos tributáveis;
    - patrimônio;
    - transferências internacionais;
    - deduções aplicáveis;
    - impostos pagos no exterior;
    - tipo de atividade econômica (quando aplicável);
    - distribuição estimada entre pró-labore e lucro (quando PJ);
    - parâmetros configuráveis para simulação.
Parâmetros de simulação PJ
O sistema deve permitir parametrização de:
    - percentual de renda alocada como pró-labore;
    - percentual de lucro distribuído;
    - custos operacionais estimados;
    - regime tributário simplificado (ex: carga efetiva estimada);
    - retenções aplicáveis;
    - encargos adicionais;
    - localização da empresa (Brasil ou exterior, em versões futuras).
#### Regras associadas
**RN-001 — Cenário PF como baseline**
O cálculo de pessoa física deve ser utilizado como base de comparação.
**RN-002 — Separação de renda PJ**
No cenário PJ, o sistema deve separar:
    - renda da empresa;
    - pró-labore (tributado como pessoa física);
    - distribuição de lucros (tratamento conforme regras configuradas).
**RN-003 — Simulação simplificada no MVP**
No MVP, o sistema pode utilizar uma carga tributária estimada para PJ, sem modelar completamente todos os regimes tributários.
**RN-004 — Rendas não elegíveis para PJ**
O sistema deve marcar rendas que não podem ser facilmente alocadas em PJ (ex: certas aposentadorias, pensões ou estruturas específicas).
**RN-005 — Rendas internacionais**
Rendas estrangeiras devem ser tratadas de forma diferenciada no cenário PJ, podendo exigir análise adicional.
**RN-006 — Trust e estruturas complexas**
Se houver trust ou estruturas offshore, o sistema deve marcar a simulação como complexa e não conclusiva.
**RN-007 — Impacto de distribuição de lucros**
O sistema deve considerar que a forma de distribuição impacta a carga tributária total.
**RN-008 — Custos operacionais**
Custos operacionais devem reduzir a base tributável no cenário PJ.
**RN-009 — Limitação de recomendação**
O sistema não deve recomendar automaticamente PF ou PJ, apenas apresentar comparativo.
**RN-010 — Transparência de premissas**
Todas as premissas utilizadas na simulação devem ser apresentadas ao usuário.
#### Fluxo esperado
1. Usuário acessa o módulo de simulação PF vs PJ.
2. Sistema recupera dados fiscais e rendas cadastradas.
3. Sistema calcula o cenário PF com base nas regras existentes.
4. Sistema solicita ou aplica parâmetros para o cenário PJ.
5. Sistema simula a alocação de renda na pessoa jurídica.
6. Sistema calcula a carga tributária estimada para PJ.
7. Sistema consolida os dois cenários.
8. Sistema calcula a diferença entre PF e PJ.
9. Sistema identifica pontos de divergência.
10. Sistema destaca limitações e casos complexos.
11. Sistema apresenta resultado comparativo ao usuário.
#### Validações
- Simulação só deve ser executada se houver dados mínimos de renda.
- O sistema deve permitir ajuste dos parâmetros de PJ.
- O sistema deve indicar quando está usando valores estimados.
- Rendas incompatíveis com PJ devem ser destacadas.
- Cenários com dados incompletos devem ser marcados como estimativos.
- Simulações com trust ou offshore devem ser marcadas como complexas.
- O sistema deve impedir interpretação do resultado como recomendação definitiva.
- Deve ser possível recalcular a simulação com parâmetros diferentes.
- Todas as premissas devem ser exibidas claramente.
- O sistema deve manter rastreabilidade dos cálculos.
#### Campos sugeridos no banco de dados
TaxSimulation
- id
- user_id
- simulation_type
- tax_year
- pf_total_tax
- pj_total_tax
- tax_difference
- pf_total_income
- pj_total_income
- pj_operational_costs
- pj_profit_distribution
- pj_pro_labore_percentage
- pj_estimated_tax_rate
- has_foreign_income
- has_trust_structure
- has_complex_cases
- requires_additional_review
- simulation_status
- rule_version
- created_at
- updated_at
TaxSimulationParameter
- id
- simulation_id
- parameter_name
- parameter_value
- parameter_type
- is_user_defined
- created_at
- updated_at
TaxSimulationItem
- id
- simulation_id
- scenario_type
- source_type
- source_id
- description
- income_amount
- tax_amount
- notes
- requires_review
- created_at
- updated_at
#### Observações importantes
Essa funcionalidade deve ser tratada como simulação, não como planejamento tributário definitivo.
#### Na prática:
- nem toda renda pode ser convertida em PJ;
- nem toda estrutura PJ é válida ou vantajosa para todos os usuários;
- existem implicações legais, operacionais e fiscais fora do escopo do cálculo;
- estruturas internacionais podem alterar completamente o cenário;
- trust, offshore e dupla residência fiscal aumentam a complexidade.
O valor dessa funcionalidade está em dar visibilidade comparativa, não em fornecer uma decisão final.
### RF-014 — Atualização contínua de dados
#### Descrição
O sistema deve permitir que o usuário atualize continuamente suas informações fiscais, patrimoniais e financeiras ao longo do tempo, evitando que o cálculo tributário fique baseado em dados antigos, incompletos ou inconsistentes.
Essa funcionalidade é importante porque a situação tributária do usuário pode mudar frequentemente por conta de novas rendas, transferências, vendas de ativos, alterações de residência fiscal, criação de empresas, recebimento de trust, deduções, isenções ou impostos pagos no exterior.
#### Objetivo
Permitir que o sistema mantenha uma visão fiscal atualizada do usuário para:
    - recalcular impostos com base em dados recentes;
    - refletir mudanças na residência fiscal;
    - atualizar fontes de renda;
    - registrar novas transferências internacionais;
    - atualizar patrimônio;
    - registrar eventos de ganho de capital;
    - incluir novas deduções ou isenções;
    - manter histórico das alterações;
    - permitir comparação entre versões anteriores e atuais;
    - reduzir risco de cálculos incorretos.
Dados que devem permitir atualização
O sistema deve permitir atualização contínua de:
    - dados cadastrais do usuário;
    - residência fiscal;
    - fontes de renda;
    - valores recebidos mensalmente;
    - país de origem da renda;
    - moeda;
    - taxa de câmbio;
    - impostos pagos no exterior;
    - patrimônio;
    - valor atualizado dos ativos;
    - transferências internacionais;
    - trusts;
    - participação em empresas;
    - deduções;
    - isenções;
    - documentos comprobatórios;
    - parâmetros de simulação;
    - status de pendências;
    - observações do usuário ou especialista.
Tipos de atualização suportados
1. Atualização manual
O usuário deve conseguir editar diretamente dados cadastrados anteriormente.
#### Exemplos:
- alterar valor de renda mensal;
- adicionar novo salário recebido;
- corrigir país de origem da renda;
- atualizar valor de patrimônio;
- anexar comprovante faltante.
2. Atualização periódica
O sistema deve permitir que dados recorrentes sejam atualizados por período.
#### Exemplos:
- salário mensal;
- aposentadoria mensal;
- recebimento periódico de trust;
- pagamento mensal de carnê-leão;
- dividendos recorrentes.
3. Atualização por evento
O sistema deve permitir inclusão de novos eventos fiscais.
#### Exemplos:
- venda de imóvel;
- venda de ações;
- recebimento de bônus;
- transferência internacional;
- distribuição de trust;
- mudança de residência fiscal.
4. Atualização por importação futura
Em versões futuras, o sistema poderá importar dados automaticamente de fontes externas.
#### Exemplos:
- extratos bancários;
- corretoras;
- plataformas de investimento;
- APIs fiscais;
- planilhas;
- documentos enviados pelo usuário.
#### Regras associadas
**RN-001 — Histórico de alterações**
Toda alteração relevante deve ser registrada com data, usuário responsável e valor anterior.
**RN-002 — Reprocessamento automático**
Quando uma informação que impacta cálculo for alterada, o sistema deve marcar os cálculos relacionados como desatualizados ou solicitar recálculo.
**RN-003 — Atualização de residência fiscal**
Mudanças na residência fiscal devem impactar as regras aplicáveis a partir da data informada.
**RN-004 — Atualização de renda**
Alterações em renda devem impactar o cálculo do período correspondente, mensal ou anual.
**RN-005 — Atualização de patrimônio**
Alterações em patrimônio devem impactar cálculos futuros de ganho de capital, análise patrimonial e relatórios.
**RN-006 — Atualização de deduções**
Deduções adicionadas ou alteradas devem ser reaplicadas ao período fiscal correto.
**RN-007 — Atualização de documentos**
Quando um documento obrigatório for enviado posteriormente, o status do item relacionado deve ser atualizado.
**RN-008 — Controle de versão**
O sistema deve manter versões dos dados usados nos cálculos e relatórios gerados.
**RN-009 — Integridade dos dados**
O sistema não deve permitir atualizações que quebrem a consistência dos cálculos, como datas incompatíveis ou valores negativos.
**RN-010 — Reabertura de relatório**
Se dados que impactam um relatório já gerado forem alterados, o sistema deve indicar que o relatório anterior está desatualizado.
#### Fluxo esperado
1. Usuário acessa uma seção já cadastrada.
2. Sistema exibe os dados atuais e histórico resumido.
3. Usuário altera, adiciona ou remove uma informação.
4. Sistema valida a alteração.
5. Sistema registra o histórico da mudança.
6. Sistema identifica quais cálculos, relatórios ou classificações são impactados.
7. Sistema marca itens relacionados como pendentes de recálculo, se necessário.
8. Sistema permite executar novo cálculo.
9. Sistema atualiza relatórios e simulações com base nos novos dados.
#### Validações
- Alterações devem ser vinculadas ao usuário responsável.
- Campos obrigatórios não podem ser apagados sem substituição válida.
- Valores monetários não podem ser negativos.
- Datas não podem gerar inconsistência fiscal.
- Moeda deve permanecer coerente com o país e a operação.
- Alterações em dados já usados em cálculo devem gerar alerta de impacto.
- Documentos substituídos devem manter histórico.
- Exclusões devem ser lógicas, não físicas, quando impactarem rastreabilidade.
- Alterações em trust, renda estrangeira ou ganho de capital devem marcar o caso para possível revisão.
- Atualizações devem preservar trilha de auditoria.
#### Campos sugeridos no banco de dados
DataChangeLog
- id
- user_id
- entity_type
- entity_id
- field_name
- previous_value
- new_value
- change_reason
- changed_by
- changed_at
- affects_tax_calculation
- affects_report
- requires_recalculation
DataVersion
- id
- user_id
- entity_type
- entity_id
- version_number
- snapshot_data
- created_at
- created_by
- used_in_calculation_id
- used_in_report_id
RecalculationQueue
- id
- user_id
- trigger_entity_type
- trigger_entity_id
- affected_module
- recalculation_status
- priority
- created_at
- processed_at
#### Observações importantes
A atualização contínua de dados é essencial porque o sistema não deve funcionar apenas como uma calculadora pontual.
Ele deve funcionar como uma plataforma de acompanhamento fiscal, onde novas informações podem alterar cálculos anteriores ou futuros.
#### Exemplos:
- se o usuário alterar a residência fiscal, todas as rendas internacionais daquele período podem mudar de tratamento;
- se cadastrar imposto pago no exterior depois, o crédito tributário pode alterar o saldo a pagar;
- se adicionar custo de aquisição de ativo, o ganho de capital pode mudar;
- se anexar comprovante de dedução, a base de cálculo pode ser reduzida;
- se corrigir uma transferência como “conta própria”, ela pode deixar de ser tributável.
Por isso, toda atualização precisa ser rastreável, versionada e capaz de acionar recálculo.
### RF-015 — Suporte a múltiplas rendas
#### Descrição
O sistema deve permitir que o usuário cadastre, mantenha, classifique e calcule múltiplas fontes de renda simultaneamente, considerando que cada renda pode ter origem, natureza, periodicidade, moeda e tratamento tributário diferente.
Esse requisito é essencial porque o usuário pode ter, ao mesmo tempo:
    - salário no exterior;
    - dividendos;
    - aposentadoria;
    - social security;
    - distribuição de trust;
    - aluguel;
    - ganho de capital;
    - participação societária;
    - remuneração em ações;
    - renda no Brasil e no exterior.
#### Objetivo
Permitir que o sistema consolide diferentes rendas sem perder a individualidade fiscal de cada uma.
O sistema deve ser capaz de:
    - cadastrar várias fontes de renda por usuário;
    - classificar cada renda separadamente;
    - aplicar regras específicas por renda;
    - calcular imposto por fonte, por mês e por ano;
    - consolidar o total tributável;
    - evitar duplicidade de valores;
    - identificar rendas complexas;
    - permitir que uma renda tenha tratamento diferente de outra.
Tipos de múltiplas rendas suportadas
Rendas recorrentes
- salário mensal;
- aposentadoria;
- pensão;
- social security;
- aluguel;
- distribuição periódica de trust.
Rendas eventuais
- bônus;
- venda de ativo;
- ganho de capital;
- dividendos eventuais;
- distribuição pontual de trust;
- recebimento por participação societária.
Rendas em moeda estrangeira
- salário em dólar;
- dividendos em dólar;
- aposentadoria dos EUA;
- renda de investimentos estrangeiros;
- pagamentos de trust no exterior.
Rendas em diferentes jurisdições
- renda brasileira;
- renda americana;
- renda de outro país;
- renda mista;
- renda com dupla tributação potencial.
Rendas complexas
- RSUs;
- stock options;
- trust;
- offshore;
- participação societária;
- contas previdenciárias estrangeiras.
Dados necessários por renda
Cada renda cadastrada deve manter seus próprios dados, incluindo:
    - tipo da renda;
    - nome da fonte pagadora;
    - país de origem;
    - moeda;
    - valor bruto;
    - valor líquido, se disponível;
    - data de recebimento;
    - periodicidade;
    - imposto pago no exterior;
    - imposto retido na fonte;
    - vínculo com transferência internacional;
    - vínculo com ativo patrimonial;
    - vínculo com trust;
    - vínculo com empresa;
    - status de classificação;
    - módulo de cálculo aplicável;
    - necessidade de revisão;
    - documentos comprobatórios.
#### Regras associadas
**RN-001 — Independência entre rendas**
Cada fonte de renda deve ser armazenada, classificada e processada individualmente antes da consolidação.
**RN-002 — Consolidação posterior**
O sistema deve consolidar as rendas somente após classificação individual, evitando que rendas com tratamentos diferentes sejam somadas incorretamente.
**RN-003 — Rendas com tratamentos diferentes**
O sistema deve permitir que diferentes rendas do mesmo usuário tenham tratamentos tributários distintos.
#### Exemplo:
- salário dos EUA → carnê-leão;
- transferência entre contas próprias → não tributável;
- venda de ações → ganho de capital;
- trust → caso complexo.
**RN-004 — Agrupamento por período**
Rendas devem ser agrupadas por mês e por ano, conforme o tipo de cálculo.
**RN-005 — Agrupamento por módulo**
O sistema deve separar rendas por módulo tributário:
    - imposto de renda;
    - carnê-leão;
    - ganho de capital;
    - crédito tributário;
    - trust;
    - simulação PF vs PJ.
**RN-006 — Moedas diferentes**
Rendas em moedas diferentes devem ser convertidas para a moeda de consolidação antes do cálculo final.
**RN-007 — Imposto pago no exterior**
Cada renda deve manter seu próprio valor de imposto pago ou retido no exterior, para análise individual de crédito tributário.
**RN-008 — Evitar duplicidade**
O sistema deve identificar possíveis duplicidades, especialmente quando uma renda também aparece como transferência internacional.
**RN-009 — Renda complexa**
Rendas relacionadas a trust, RSU, stock options, offshore ou dupla residência fiscal devem ser marcadas como complexas.
**RN-010 — Renda incompleta**
Rendas com informações insuficientes não devem ser usadas em cálculo definitivo, apenas em estimativas ou relatórios pendentes.
#### Fluxo esperado
1. Usuário acessa o módulo de rendas.
2. Sistema permite adicionar uma ou mais fontes de renda.
3. Usuário informa os dados de cada renda.
4. Sistema classifica individualmente cada fonte.
5. Sistema identifica o módulo tributário aplicável.
6. Sistema verifica se há imposto pago no exterior.
7. Sistema identifica se há vínculo com transferências, patrimônio ou trust.
8. Sistema converte valores quando houver moeda estrangeira.
9. Sistema agrupa rendas por período e categoria.
10. Sistema consolida os valores para cálculo e relatório.
#### Validações
- O usuário deve poder cadastrar múltiplas fontes de renda.
- Cada renda deve possuir identificador único.
- Cada renda deve possuir tipo, valor, moeda e país de origem.
- Rendas recorrentes devem possuir periodicidade.
- Rendas eventuais devem possuir data de recebimento.
- Rendas estrangeiras devem possuir moeda e país de origem.
- Rendas com imposto pago no exterior devem manter esse valor separadamente.
- Rendas vinculadas a transferências devem evitar duplicidade no cálculo.
- Rendas vinculadas a trust devem exigir informações adicionais.
- Rendas incompletas devem ser marcadas como pendentes.
- Rendas complexas devem ser marcadas para revisão.
- O sistema deve permitir edição individual de cada renda.
- O sistema deve manter histórico de alterações por renda.
#### Campos sugeridos no banco de dados
IncomeSource
- id
- user_id
- payer_name
- income_type
- income_category
- origin_country
- currency
- gross_amount
- net_amount
- payment_date
- frequency
- is_recurring
- foreign_tax_paid
- tax_withheld
- linked_transfer_id
- linked_asset_id
- linked_trust_id
- linked_company_id
- classification_status
- tax_treatment
- calculation_module
- requires_carne_leao
- requires_capital_gain
- requires_tax_credit_analysis
- requires_additional_review
- supporting_document_url
- created_at
- updated_at
IncomeAggregation
- id
- user_id
- tax_period
- aggregation_type
- income_category
- origin_country
- currency
- total_gross_amount
- total_taxable_amount
- total_foreign_tax_paid
- calculation_module
- created_at
- updated_at
#### Observações importantes
Esse requisito garante que o sistema não trate a renda do usuário como um único valor agregado.
Isso é importante porque, no contexto tributário internacional, cada renda pode ter uma regra diferente.
Exemplo de um mesmo usuário:
    - salário dos EUA: tributável via carnê-leão;
    - dividendos dos EUA: renda de investimento com possível crédito tributário;
    - transferência própria EUA → Brasil: não tributável;
    - RSU da Amazon: caso complexo;
    - aluguel no Brasil: renda nacional;
    - trust irrevogável: possível não incidência ou revisão especializada.
Portanto, o sistema deve sempre processar cada renda individualmente antes de consolidar o resultado final.
### RF-016 — Entrada manual e futura integração
#### Descrição
O sistema deve permitir, inicialmente, a entrada manual de dados pelo usuário e, futuramente, suportar integrações com fontes externas para importação automática ou semiautomática de informações fiscais, financeiras e patrimoniais.
Esse requisito é importante porque o MVP pode começar de forma simples, usando formulários guiados, mas a plataforma deve ser desenhada para evoluir e reduzir o esforço manual do usuário.
#### Objetivo
Permitir que o sistema:
    - funcione no MVP sem depender de integrações externas;
    - colete dados via formulários manuais;
    - aceite documentos e comprovantes enviados pelo usuário;
    - permita importação futura de extratos, planilhas e APIs;
    - reduza retrabalho no cadastro de informações;
    - melhore a precisão dos dados;
    - facilite atualização contínua;
    - mantenha rastreabilidade da origem dos dados.
Tipos de entrada suportados no MVP
Entrada manual por formulário
O usuário deve conseguir informar manualmente dados como:
    - residência fiscal;
    - fontes de renda;
    - patrimônio;
    - transferências internacionais;
    - trusts;
    - deduções;
    - isenções;
    - impostos pagos no exterior;
    - eventos de ganho de capital.
Upload de documentos
O sistema deve permitir anexar documentos relacionados às informações cadastradas, como:
    - comprovantes de renda;
    - informes de rendimento;
    - extratos bancários;
    - comprovantes de transferência;
    - recibos de imposto pago no exterior;
    - documentos de trust;
    - contratos;
    - notas de corretagem;
    - documentos de aquisição e venda de ativos;
    - comprovantes de despesas dedutíveis.
Importação por planilha
Em uma etapa intermediária, o sistema pode permitir importação via arquivos estruturados, como:
    - CSV;
    - XLSX;
    - template próprio da plataforma.
Integrações futuras previstas
O sistema deve ser projetado para suportar futuras integrações com:
    - bancos;
    - corretoras;
    - exchanges de criptoativos;
    - plataformas de investimento;
    - sistemas fiscais;
    - APIs de câmbio;
    - APIs de documentos;
    - APIs contábeis;
    - fontes de dados de payroll;
    - sistemas de declaração fiscal;
    - softwares de gestão patrimonial.
Dados que poderão ser importados futuramente
As integrações futuras poderão importar:
    - transações bancárias;
    - transferências internacionais;
    - rendimentos de investimentos;
    - dividendos;
    - juros;
    - venda de ativos;
    - compra de ativos;
    - taxas e corretagens;
    - impostos retidos;
    - saldos de contas;
    - patrimônio atualizado;
    - documentos fiscais;
    - histórico de câmbio;
    - dados de folha de pagamento;
    - contribuições previdenciárias;
    - distribuições de trust ou entidades offshore.
#### Regras associadas
**RN-001 — MVP deve aceitar entrada manual**
O sistema deve ser funcional mesmo sem qualquer integração externa.
**RN-002 — Dados manuais e importados devem seguir o mesmo modelo**
Informações inseridas manualmente e informações importadas devem alimentar as mesmas entidades do sistema, como renda, patrimônio, transferência e dedução.
**RN-003 — Origem dos dados deve ser registrada**
Todo dado deve registrar sua origem:
    - manual;
    - upload de arquivo;
    - importação de planilha;
    - API;
    - integração bancária;
    - integração de corretora;
    - integração fiscal.
**RN-004 — Dados importados devem passar por validação**
Nenhum dado importado deve ser usado automaticamente em cálculo definitivo sem passar por validação mínima.
**RN-005 — Prevenção de duplicidade**
O sistema deve identificar possíveis duplicidades entre dados manuais e dados importados.
#### Exemplo:
- usuário cadastrou salário manualmente;
- depois importou extrato bancário contendo a mesma entrada;
- o sistema deve sugerir vinculação, não duplicação.
**RN-006 — Integrações devem ser opcionais**
O usuário não deve ser obrigado a conectar contas externas para utilizar o sistema.
**RN-007 — Consentimento para integração**
Antes de qualquer integração externa, o usuário deve autorizar explicitamente o acesso aos dados.
**RN-008 — Revogação de acesso**
O usuário deve poder remover integrações e revogar permissões.
**RN-009 — Rastreabilidade**
O sistema deve manter histórico da origem, data de importação, status de validação e vínculo com cálculos.
**RN-010 — Dados incompletos importados**
Dados importados incompletos devem ser classificados como pendentes e solicitar complementação do usuário.
**RN-011 — Documentos não estruturados**
Documentos enviados pelo usuário podem ser armazenados inicialmente apenas como anexos. Em fases futuras, poderão ser processados por OCR ou IA para extração de dados.
**RN-012 — Segurança das integrações**
Integrações com terceiros devem utilizar autenticação segura, tokens criptografados e controle de escopo de acesso.
Fluxo esperado — entrada manual
1. Usuário acessa um módulo do sistema.
2. Sistema apresenta formulário guiado.
3. Usuário informa os dados solicitados.
4. Usuário anexa documentos, se necessário.
5. Sistema valida os campos obrigatórios.
6. Sistema salva os dados com origem “manual”.
7. Sistema envia os dados para classificação e cálculo.
Fluxo esperado — importação por planilha
1. Usuário seleciona opção de importação.
2. Sistema disponibiliza template ou aceita arquivo compatível.
3. Usuário envia o arquivo.
4. Sistema valida estrutura do arquivo.
5. Sistema identifica registros válidos, incompletos ou duplicados.
6. Sistema exibe prévia para confirmação.
7. Usuário aprova a importação.
8. Sistema salva os dados com origem “importação por planilha”.
9. Sistema encaminha os registros para classificação.
Fluxo esperado — integração futura via API
1. Usuário seleciona provedor de integração.
2. Sistema apresenta escopos de acesso solicitados.
3. Usuário autoriza a conexão.
4. Sistema recebe token de acesso de forma segura.
5. Sistema importa dados disponíveis.
6. Sistema normaliza os dados para o modelo interno.
7. Sistema identifica duplicidades e pendências.
8. Sistema solicita confirmação do usuário quando necessário.
9. Sistema salva os registros importados.
10. Sistema permite revogar integração a qualquer momento.
#### Validações
- Entrada manual deve validar campos obrigatórios por tipo de dado.
- Arquivos importados devem ter formato aceito.
- Planilhas devem seguir estrutura mínima definida.
- Dados importados devem ser normalizados antes de uso.
- Valores monetários devem ter moeda associada.
- Datas devem estar em formato válido.
- Países devem usar lista padronizada.
- Transações duplicadas devem ser sinalizadas.
- Dados sem origem identificada devem ser rejeitados ou marcados como pendentes.
- Integrações externas devem exigir consentimento explícito.
- Tokens e credenciais não devem ser armazenados em texto puro.
- O usuário deve poder excluir ou desconectar integrações.
- Registros usados em cálculos devem manter rastreabilidade.
#### Campos sugeridos no banco de dados
DataSource
- id
- user_id
- source_type
- source_name
- provider_name
- connection_status
- authorization_scope
- last_sync_at
- revoked_at
- created_at
- updated_at
ImportedRecord
- id
- user_id
- data_source_id
- record_type
- external_record_id
- raw_payload
- normalized_payload
- import_status
- validation_status
- duplicate_status
- linked_entity_type
- linked_entity_id
- requires_user_confirmation
- created_at
- updated_at
DocumentAttachment
- id
- user_id
- related_entity_type
- related_entity_id
- document_type
- file_name
- file_url
- uploaded_at
- extraction_status
- extracted_payload
- reviewed_by_user
- created_at
- updated_at
#### Observações importantes
Esse requisito deve ser pensado desde o início para evitar retrabalho na arquitetura.
Mesmo que o MVP use apenas entrada manual, o modelo de dados deve suportar origem dos dados, validação e rastreabilidade.
#### Exemplo:
- uma renda pode ser cadastrada manualmente hoje;
- amanhã pode ser importada de uma planilha;
- futuramente pode vir diretamente de uma corretora;
- em todos os casos, ela deve alimentar a mesma entidade IncomeSource.
A principal decisão arquitetural é separar:
    - origem dos dados;
    - normalização dos dados;
    - entidade fiscal final usada no cálculo.
Isso permitirá evoluir o produto sem reescrever o motor de regras.
### RF-017 — Cálculo mensal (carnê-leão)
#### Descrição
O sistema deve calcular mensalmente o imposto estimado devido sobre rendimentos recebidos do exterior por pessoa física residente fiscal no Brasil, conforme lógica de apuração mensal do carnê-leão.
Esse requisito é essencial porque, conforme a transcrição, rendimentos recebidos do exterior devem ser declarados e apurados mensalmente quando o usuário é residente fiscal no Brasil.
#### Objetivo
Permitir que o sistema:
    - identifique rendas estrangeiras sujeitas ao carnê-leão;
    - agrupe rendimentos por mês de recebimento;
    - converta valores em moeda estrangeira para reais;
    - aplique deduções mensais elegíveis;
    - calcule base de cálculo mensal;
    - aplique alíquota correspondente;
    - considere imposto pago no exterior, quando aplicável;
    - apresente imposto mensal estimado;
    - gere histórico mensal de apuração.
Rendas que podem entrar no carnê-leão
O sistema deve considerar como possíveis rendas sujeitas ao carnê-leão:
    - salário recebido do exterior;
    - remuneração por serviços prestados a empresa estrangeira;
    - aposentadoria estrangeira;
    - pensão recebida do exterior;
    - Social Security;
    - dividendos estrangeiros, conforme regra aplicável;
    - pagamentos recorrentes de trust;
    - distribuição de entidade estrangeira;
    - aluguel recebido do exterior;
    - rendimentos de pessoa física ou fonte pagadora estrangeira;
    - outros valores classificados como renda estrangeira tributável.
Dados necessários para o cálculo
Para cada renda mensal, o sistema deve considerar:
    - usuário;
    - residência fiscal no período;
    - mês de competência;
    - data de recebimento;
    - país de origem;
    - tipo da renda;
    - moeda original;
    - valor bruto;
    - taxa de câmbio aplicável;
    - valor convertido em reais;
    - imposto pago no exterior;
    - imposto retido na fonte no exterior;
    - deduções mensais aplicáveis;
    - isenções aplicáveis;
    - classificação da renda;
    - status de validação da renda;
    - documentos comprobatórios;
    - observações.
#### Regras associadas
**RN-001 — Aplicação somente para residente fiscal no Brasil**
O cálculo de carnê-leão deve ser aplicado quando o usuário for residente fiscal no Brasil no período analisado.
**RN-002 — Renda do exterior**
Se o usuário residente fiscal no Brasil receber renda do exterior, o sistema deve classificar essa renda como potencialmente sujeita ao carnê-leão.
**RN-003 — Agrupamento mensal**
O sistema deve agrupar as rendas sujeitas ao carnê-leão por mês de recebimento.
**RN-004 — Conversão cambial**
Rendas recebidas em moeda estrangeira devem ser convertidas para reais antes do cálculo.
**RN-005 — Base de cálculo mensal**
A base mensal deve considerar rendas tributáveis do mês, deduções elegíveis e isenções aplicáveis.
Base mensal = renda estrangeira tributável convertida para BRL - deduções mensais - isenções
**RN-006 — Aplicação da alíquota**
O sistema deve aplicar a alíquota correspondente à base mensal.
No MVP, pode ser utilizada a premissa simplificada da transcrição de aplicar 27,5% para usuários acima da faixa relevante de tributação.
**RN-007 — Imposto pago no exterior**
Se houver imposto pago ou retido no exterior, o sistema deve armazenar o valor e apresentar como possível crédito tributário ou abatimento, conforme regra configurada.
**RN-008 — Transferência não é o fato gerador**
Se o usuário apenas transferir dinheiro de uma conta própria no exterior para conta própria no Brasil, o sistema não deve gerar carnê-leão automaticamente. O sistema deve verificar a origem econômica do recurso.
**RN-009 — Data de recebimento**
O cálculo deve considerar a data de recebimento da renda, não necessariamente a data da transferência para o Brasil.
**RN-010 — Renda incompleta**
Rendas sem valor, moeda, data ou país de origem devem ficar pendentes e não devem compor cálculo definitivo.
**RN-011 — Casos complexos**
Rendas relacionadas a trust, RSU, stock options, offshore ou dupla residência fiscal devem ser marcadas como cálculo preliminar ou requer revisão.
**RN-012 — Histórico mensal**
Cada cálculo mensal deve ser armazenado com período, regra aplicada, valores considerados e status.
#### Fluxo esperado
1. Sistema identifica usuário residente fiscal no Brasil.
2. Sistema recupera rendas estrangeiras classificadas como tributáveis.
3. Sistema agrupa rendas por mês de recebimento.
4. Sistema converte valores em moeda estrangeira para reais.
5. Sistema aplica deduções mensais elegíveis.
6. Sistema aplica isenções, quando houver.
7. Sistema calcula a base mensal.
8. Sistema aplica a alíquota correspondente.
9. Sistema considera imposto pago no exterior, quando informado.
10. Sistema calcula imposto mensal estimado.
11. Sistema marca o cálculo como definitivo, estimado, pendente ou requer revisão.
12. Sistema armazena o histórico mensal.
13. Sistema envia os dados para relatório anual e relatório mensal.
#### Validações
- Usuário deve possuir residência fiscal definida para o período.
- Renda deve estar classificada como estrangeira tributável.
- Cada renda deve possuir data de recebimento.
- Cada renda deve possuir valor bruto.
- Cada renda deve possuir moeda.
- Cada renda estrangeira deve possuir país de origem.
- Taxa de câmbio deve existir para valores em moeda estrangeira.
- Deduções mensais devem pertencer ao mesmo período.
- Isenções devem estar válidas para o período.
- Transferências próprias não devem compor o carnê-leão.
- Rendas duplicadas não devem ser contabilizadas duas vezes.
- Base mensal não pode ser negativa.
- Imposto mensal não pode ser negativo.
- Rendas incompletas devem ficar pendentes.
- Casos complexos devem ser marcados para revisão.
- Todo cálculo deve manter versão da regra aplicada.
#### Campos sugeridos no banco de dados
MonthlyTaxCalculation
- id
- user_id
- tax_year
- tax_month
- fiscal_residence_status
- total_foreign_income
- total_foreign_income_brl
- total_deductions
- total_exemptions
- taxable_base
- applied_tax_rate
- gross_tax
- foreign_tax_paid
- estimated_tax_credit
- net_tax_due
- calculation_status
- requires_additional_review
- rule_version
- created_at
- updated_at
MonthlyTaxCalculationItem
- id
- monthly_tax_calculation_id
- income_source_id
- tax_event_id
- income_type
- origin_country
- payment_date
- original_amount
- original_currency
- exchange_rate
- amount_brl
- foreign_tax_paid
- deduction_amount
- exemption_amount
- taxable_amount
- calculated_tax
- requires_review
- notes
- created_at
- updated_at
#### Observações importantes
O carnê-leão deve ser calculado mensalmente, e não apenas de forma anual consolidada.
Um ponto crítico é separar:
    - renda estrangeira recebida;
    - transferência bancária internacional;
    - simples movimentação entre contas próprias.

#### Exemplo:
- usuário recebeu salário dos EUA em janeiro: pode gerar carnê-leão de janeiro;
- usuário transferiu em março esse dinheiro da conta americana para a conta brasileira: a transferência em março não deve gerar novo imposto;
- usuário apenas moveu dinheiro próprio entre contas: não há renda nova.
Esse requisito deve ter forte rastreabilidade porque o cálculo mensal alimenta o relatório anual e pode impactar créditos tributários, deduções e saldo final estimado.
#### Regras de Negócio — Detalhamento
**RN-001 — Renda do exterior tributada no Brasil**
#### Descrição
Rendimentos recebidos do exterior por pessoa física residente fiscal no Brasil devem ser considerados tributáveis no Brasil, salvo hipóteses específicas de isenção.
#### Objetivo
Garantir que o sistema identifique corretamente a incidência de imposto sobre rendas estrangeiras.
#### Condições de aplicação
- Usuário é residente fiscal no Brasil
- Renda tem origem fora do Brasil
- Há recebimento de valor que represente acréscimo patrimonial
#### Ações do sistema
- Classificar a renda como estrangeira tributável
- Encaminhar para cálculo via carnê-leão ou outro módulo aplicável
- Registrar país de origem e moeda
- Marcar possibilidade de crédito tributário
#### Exceções
- Rendas isentas conforme legislação aplicável
- Transferências entre contas próprias sem novo fato gerador
**RN-002 — Transferência própria não tributável**
#### Descrição
Transferências entre contas de mesma titularidade não devem ser consideradas eventos tributáveis.
#### Objetivo
Evitar tributação indevida sobre simples movimentação financeira.
#### Condições de aplicação
- Conta de origem e destino pertencem ao mesmo titular
- Não há nova geração de renda
- Não há mudança de titularidade de patrimônio
#### Ações do sistema
- Classificar como transferência não tributável
- Não incluir no cálculo de imposto
- Registrar apenas como movimentação financeira
#### Exceções
- Quando a origem econômica do valor for renda não declarada
- Quando houver inconsistência de dados
**RN-003 — Trust irrevogável pode não ser tributado**
#### Descrição
Trusts irrevogáveis, sem controle do beneficiário e com transferência efetiva de titularidade, podem não ser considerados tributáveis, dependendo das características da estrutura.
#### Objetivo
Refletir o entendimento prático sobre estruturas que não geram incidência tributária direta.
#### Condições de aplicação
- Trust é irrevogável
- Usuário não possui controle sobre o patrimônio
- Não há possibilidade de reversão
- Trustee independente
- Jurisdição estrangeira relevante
#### Ações do sistema
- Classificar como potencialmente não tributável
- Marcar como caso complexo
- Exigir análise adicional
#### Exceções
- Se houver distribuição de renda
- Se houver controle indireto
- Se houver inconsistência de informações
**RN-004 — Trust revogável tributável**
#### Descrição
Trusts revogáveis, ou com controle do beneficiário, devem ser considerados tributáveis.
#### Objetivo
Capturar situações em que o usuário mantém controle sobre o patrimônio.
#### Condições de aplicação
- Trust é revogável
- Ou existe controle direto ou indireto
- Ou existe possibilidade de reversão
#### Ações do sistema
- Classificar como tributável
- Encaminhar rendimentos ao cálculo de imposto
- Marcar como renda potencialmente tributável
#### Exceções
- Situações com documentação conflitante devem ser marcadas como pendentes
**RN-005 — Ganho de capital separado**
#### Descrição
Ganhos de capital devem ser apurados separadamente da renda comum.
#### Objetivo
Garantir correta aplicação das regras específicas de apuração.
#### Condições de aplicação
- Venda de ativo
- Valor de venda maior que custo de aquisição
#### Ações do sistema
- Calcular ganho de capital separadamente
- Aplicar regras específicas de cálculo
- Não misturar com renda mensal
#### Exceções
- Venda com prejuízo não gera imposto
- Dados incompletos devem impedir cálculo definitivo
**RN-006 — Aplicação de deduções**
#### Descrição
Deduções elegíveis devem ser aplicadas antes do cálculo do imposto.
#### Objetivo
Reduzir corretamente a base de cálculo conforme regras tributárias.
#### Condições de aplicação
- Dedução válida conforme regra
- Dedução vinculada ao período correto
- Documentação disponível, quando exigido
#### Ações do sistema
- Reduzir base de cálculo
- Registrar dedução aplicada
- Manter rastreabilidade
#### Exceções
- Dedução sem comprovação pode ser marcada como pendente
- Dedução inválida não deve ser aplicada
**RN-007 — Aplicação de isenções**
#### Descrição
Isenções devem ser aplicadas quando o usuário atender aos critérios legais.
#### Objetivo
Garantir que rendas isentas não sejam tributadas indevidamente.
#### Condições de aplicação
- Usuário se enquadra em condição de isenção
- Regra aplicável ao tipo de renda
#### Ações do sistema
- Excluir valor da base tributável
- Marcar renda como isenta
- Registrar justificativa
#### Exceções
- Isenções não comprovadas devem ser tratadas como pendentes
**RN-008 — Crédito tributário internacional**
#### Descrição
Impostos pagos no exterior podem ser considerados para evitar dupla tributação.
#### Objetivo
Permitir análise de compensação tributária entre países.
#### Condições de aplicação
- Renda tributada no exterior
- Imposto pago comprovado
- Renda também tributável no Brasil
#### Ações do sistema
- Registrar imposto pago no exterior
- Marcar possibilidade de crédito tributário
- Apresentar valor separadamente no cálculo
#### Exceções
- Regras específicas de compensação podem variar
- No MVP, pode ser apenas informativo
**RN-009 — Tributação mensal (carnê-leão)**
#### Descrição
Rendimentos do exterior devem ser apurados mensalmente pelo carnê-leão.
#### Objetivo
Garantir conformidade com a apuração mensal obrigatória.
#### Condições de aplicação
- Usuário residente fiscal no Brasil
- Recebimento de renda do exterior
- Renda classificada como tributável
#### Ações do sistema
- Agrupar rendas por mês
- Calcular imposto mensal
- Registrar histórico mensal
#### Exceções
- Transferências próprias não devem ser incluídas
- Rendas incompletas devem ser excluídas do cálculo definitivo.

