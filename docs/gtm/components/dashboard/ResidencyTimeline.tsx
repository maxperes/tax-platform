import type { TimelineEvent } from "@/lib/derive";

export default function ResidencyTimeline({
  events,
}: {
  events: TimelineEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-navy-700/70">
        No dates recorded yet. Add your entry date in the assessment to build a
        timeline.
      </p>
    );
  }

  return (
    <ol className="relative space-y-6 border-l border-surface-border pl-6">
      {events.map((event, index) => (
        <li key={`${event.title}-${index}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[1.72rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent"
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">
            {event.date}
          </p>
          <p className="mt-1 text-sm font-medium text-navy">{event.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-navy-700/70">
            {event.detail}
          </p>
        </li>
      ))}
    </ol>
  );
}
