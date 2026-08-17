import type { ReactNode } from "react";

/** Renders `**like this**` as bold; keeps newlines (same as markdown emphasis). */
export function renderChatEmphasis(text: string): ReactNode {
  const re = /\*\*([\s\S]*?)\*\*/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${k++}`}>{text.slice(last, m.index)}</span>);
    }
    parts.push(
      <strong key={`b${k++}`} className="font-semibold text-navy">
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={`t${k++}`}>{text.slice(last)}</span>);
  }
  return parts.length > 0 ? parts : text;
}

export function formatMoney(n: unknown, currency = ""): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "—";
  const s = Math.abs(num).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

export function roleLabel(role: string): string {
  return role === "user" ? "You" : role === "assistant" ? "Assistant" : role;
}
