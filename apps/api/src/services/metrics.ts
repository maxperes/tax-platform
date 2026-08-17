/** Lightweight process metrics for /metrics and ops dashboards. */

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

export function incrMetric(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

export function getMetricsSnapshot(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
} {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges)
  };
}

export function metricsPrometheusText(): string {
  const lines: string[] = [];
  for (const [name, value] of counters) {
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }
  for (const [name, value] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}
