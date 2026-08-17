import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { DisclaimerBox } from "./DisclaimerBox";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: (payload: {
    fullName: string;
    email: string;
    country: string;
    contactMethod: string;
    description: string;
  }) => void | Promise<void>;
}

interface FormState {
  fullName: string;
  email: string;
  country: string;
  contactMethod: string;
  description: string;
  consent: boolean;
}

const EMPTY: FormState = {
  fullName: "",
  email: "",
  country: "",
  contactMethod: "email",
  description: "",
  consent: false
};

export function ReviewModal({ open, onClose, onSubmitted }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    firstFieldRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setErrors({});
      setForm(EMPTY);
    }
  }, [open]);

  if (!open) return null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = "Enter a name we can use to reply.";
    if (!form.email.trim()) next.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "That address does not look complete.";
    if (!form.country.trim()) next.country = "Tell us where you live.";
    if (!form.consent) next.consent = "Tick the box to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStatus("sending");
    try {
      await onSubmitted({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        country: form.country.trim(),
        contactMethod: form.contactMethod,
        description: form.description.trim()
      });
      setStatus("sent");
    } catch {
      setStatus("idle");
      setErrors({ consent: "Could not record the request. Try again." });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-card sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="review-modal-title" className="font-display text-xl text-navy">
            {status === "sent" ? "Request recorded" : "Request professional review"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-navy-700/60 hover:bg-surface-muted hover:text-navy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-sm text-navy">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p>A reviewer can now start from your organised file instead of a blank page.</p>
            </div>
            <p className="text-sm text-navy-700/80">
              This flags the case for additional expert review. Figures stay preliminary until a
              professional looks at the documents.
            </p>
            <PrimaryButton onClick={onClose} fullWidth>
              Close
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <DisclaimerBox variant="warning">
              This is not tax advice. A professional still needs to review documents and the treaty
              position before any filing decision.
            </DisclaimerBox>

            <div>
              <label htmlFor="review-name" className="text-sm font-medium text-navy">
                Full name
              </label>
              <input
                ref={firstFieldRef}
                id="review-name"
                className="field-input mt-1"
                value={form.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                autoComplete="name"
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-alertRed" role="alert">
                  {errors.fullName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="review-email" className="text-sm font-medium text-navy">
                Email
              </label>
              <input
                id="review-email"
                type="email"
                className="field-input mt-1"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-alertRed" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="review-country" className="text-sm font-medium text-navy">
                Country of residence
              </label>
              <input
                id="review-country"
                className="field-input mt-1"
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                aria-invalid={Boolean(errors.country)}
              />
              {errors.country && (
                <p className="mt-1 text-xs text-alertRed" role="alert">
                  {errors.country}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="review-contact" className="text-sm font-medium text-navy">
                Preferred contact method
              </label>
              <select
                id="review-contact"
                className="field-input mt-1"
                value={form.contactMethod}
                onChange={(event) => update("contactMethod", event.target.value)}
              >
                <option value="email">Email</option>
                <option value="video">Video call</option>
                <option value="phone">Phone</option>
                <option value="messaging">Messaging app</option>
              </select>
            </div>

            <div>
              <label htmlFor="review-notes" className="text-sm font-medium text-navy">
                Brief description
              </label>
              <textarea
                id="review-notes"
                rows={3}
                className="field-input mt-1"
                placeholder="What would you most want a professional to look at first?"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm text-navy-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-surface-border text-accent"
                  checked={form.consent}
                  onChange={(event) => update("consent", event.target.checked)}
                  aria-invalid={Boolean(errors.consent)}
                />
                <span>
                  I understand this is a preliminary map, not advice, and that a professional should
                  review it before any filing or financial decision.
                </span>
              </label>
              {errors.consent && (
                <p className="mt-1 text-xs text-alertRed" role="alert">
                  {errors.consent}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
              <PrimaryButton onClick={() => void handleSubmit()} disabled={status === "sending"} fullWidth>
                {status === "sending" ? "Sending…" : "Send request"}
              </PrimaryButton>
              <SecondaryButton onClick={onClose} fullWidth>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
