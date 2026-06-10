import { useState } from "react";

type AssetDraft = {
  id: string;
  name: string;
  assetType: string;
  country: string;
  acquisitionDate: string;
  acquisitionValue: string;
  acquisitionCurrency: string;
};

type TransferDraft = {
  id: string;
  fromCountry: string;
  toCountry: string;
  amount: string;
  currency: string;
  transferDate: string;
  classification: string;
};

type TrustDraft = {
  id: string;
  name: string;
  jurisdiction: string;
  trustType: string;
};

type EntitySimDraft = {
  id: string;
  scenarioName: string;
  proLaborePercent: string;
  profitDistributionPercent: string;
  estimatedEffectiveTaxRate: string;
  grossIncomeBrl: string;
};

type Props = {
  state: string;
  saving: boolean;
  error: string;
  onSaveAsset: (row: AssetDraft) => void;
  onSaveTransfer: (row: TransferDraft) => void;
  onSaveTrust: (row: TrustDraft) => void;
  onSaveEntitySim: (row: EntitySimDraft) => void;
};

const emptyAsset = (): AssetDraft => ({
  id: `new-${Date.now()}`,
  name: "",
  assetType: "real_estate",
  country: "BR",
  acquisitionDate: `${new Date().getFullYear()}-01-01`,
  acquisitionValue: "",
  acquisitionCurrency: "BRL"
});

const emptyTransfer = (): TransferDraft => ({
  id: `new-${Date.now()}`,
  fromCountry: "US",
  toCountry: "BR",
  amount: "",
  currency: "USD",
  transferDate: `${new Date().getFullYear()}-01-01`,
  classification: "own_account"
});

const emptyTrust = (): TrustDraft => ({
  id: `new-${Date.now()}`,
  name: "",
  jurisdiction: "US",
  trustType: "revocable"
});

const emptyEntitySim = (): EntitySimDraft => ({
  id: `new-${Date.now()}`,
  scenarioName: "Default PJ scenario",
  proLaborePercent: "30",
  profitDistributionPercent: "100",
  estimatedEffectiveTaxRate: "0.15",
  grossIncomeBrl: ""
});

export function DomainModuleEditor({
  state,
  saving,
  error,
  onSaveAsset,
  onSaveTransfer,
  onSaveTrust,
  onSaveEntitySim
}: Props) {
  if (state === "patrimony") {
    return <PatrimonyForm row={emptyAsset()} saving={saving} error={error} onSave={onSaveAsset} />;
  }
  if (state === "transfers") {
    return <TransferForm row={emptyTransfer()} saving={saving} error={error} onSave={onSaveTransfer} />;
  }
  if (state === "trust_registry") {
    return <TrustForm row={emptyTrust()} saving={saving} error={error} onSave={onSaveTrust} />;
  }
  if (state === "entity_simulation") {
    return <EntitySimForm row={emptyEntitySim()} saving={saving} error={error} onSave={onSaveEntitySim} />;
  }
  return null;
}

function PatrimonyForm({
  row,
  saving,
  error,
  onSave
}: {
  row: AssetDraft;
  saving: boolean;
  error: string;
  onSave: (r: AssetDraft) => void;
}) {
  const [draft, setDraft] = useState(row);
  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-xs">
      <p className="text-slate-300 font-medium">Add asset / patrimony</p>
      <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Type" value={draft.assetType} onChange={(e) => setDraft({ ...draft, assetType: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Country" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="date" value={draft.acquisitionDate} onChange={(e) => setDraft({ ...draft, acquisitionDate: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Value" value={draft.acquisitionValue} onChange={(e) => setDraft({ ...draft, acquisitionValue: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Currency" value={draft.acquisitionCurrency} onChange={(e) => setDraft({ ...draft, acquisitionCurrency: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </div>
      <button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-1 text-emerald-200 disabled:opacity-50">
        {saving ? "Saving..." : "Save asset"}
      </button>
      {error && <p className="text-rose-300">{error}</p>}
      <p className="text-slate-500">Say **none** in chat to skip if you have no assets to register.</p>
    </div>
  );
}

function TransferForm({
  row,
  saving,
  error,
  onSave
}: {
  row: TransferDraft;
  saving: boolean;
  error: string;
  onSave: (r: TransferDraft) => void;
}) {
  const [draft, setDraft] = useState(row);
  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-xs">
      <p className="text-slate-300 font-medium">Add international transfer</p>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="From" value={draft.fromCountry} onChange={(e) => setDraft({ ...draft, fromCountry: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
        <input placeholder="To" value={draft.toCountry} onChange={(e) => setDraft({ ...draft, toCountry: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Currency" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
        <input type="date" value={draft.transferDate} onChange={(e) => setDraft({ ...draft, transferDate: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </div>
      <select value={draft.classification} onChange={(e) => setDraft({ ...draft, classification: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1">
        <option value="own_account">Own account (non-taxable)</option>
        <option value="income_receipt">Income receipt</option>
        <option value="trust_distribution">Trust distribution</option>
        <option value="gift">Gift</option>
        <option value="loan">Loan</option>
        <option value="unknown">Unknown</option>
      </select>
      <button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-1 text-emerald-200 disabled:opacity-50">
        {saving ? "Saving..." : "Save transfer"}
      </button>
      {error && <p className="text-rose-300">{error}</p>}
    </div>
  );
}

function TrustForm({
  row,
  saving,
  error,
  onSave
}: {
  row: TrustDraft;
  saving: boolean;
  error: string;
  onSave: (r: TrustDraft) => void;
}) {
  const [draft, setDraft] = useState(row);
  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-xs">
      <p className="text-slate-300 font-medium">Register trust structure</p>
      <input placeholder="Trust name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Jurisdiction" value={draft.jurisdiction} onChange={(e) => setDraft({ ...draft, jurisdiction: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
        <select value={draft.trustType} onChange={(e) => setDraft({ ...draft, trustType: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          <option value="revocable">Revocable</option>
          <option value="irrevocable">Irrevocable</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-1 text-emerald-200 disabled:opacity-50">
        {saving ? "Saving..." : "Save trust"}
      </button>
      {error && <p className="text-rose-300">{error}</p>}
    </div>
  );
}

function EntitySimForm({
  row,
  saving,
  error,
  onSave
}: {
  row: EntitySimDraft;
  saving: boolean;
  error: string;
  onSave: (r: EntitySimDraft) => void;
}) {
  const [draft, setDraft] = useState(row);
  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-xs">
      <p className="text-slate-300 font-medium">PF vs PJ simulation</p>
      <input placeholder="Scenario name" value={draft.scenarioName} onChange={(e) => setDraft({ ...draft, scenarioName: e.target.value })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Pro-labore %" value={draft.proLaborePercent} onChange={(e) => setDraft({ ...draft, proLaborePercent: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Profit dist. %" value={draft.profitDistributionPercent} onChange={(e) => setDraft({ ...draft, profitDistributionPercent: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="PJ effective rate (0.15)" value={draft.estimatedEffectiveTaxRate} onChange={(e) => setDraft({ ...draft, estimatedEffectiveTaxRate: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input placeholder="Gross income BRL" value={draft.grossIncomeBrl} onChange={(e) => setDraft({ ...draft, grossIncomeBrl: e.target.value })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </div>
      <button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-1 text-emerald-200 disabled:opacity-50">
        {saving ? "Saving..." : "Run simulation"}
      </button>
      {error && <p className="text-rose-300">{error}</p>}
    </div>
  );
}
