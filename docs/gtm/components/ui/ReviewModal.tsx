"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import PrimaryButton from "./PrimaryButton";
import SecondaryButton from "./SecondaryButton";
import DisclaimerBox from "./DisclaimerBox";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
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
  consent: false,
};

const inputClass =
  "w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy placeholder:text-navy-700/40 focus:border-accent focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent";

export default function ReviewModal({ open, onClose, onSubmitted }: Props) {
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
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "That address does not look complete.";
    if (!form.country.trim()) next.country = "Tell us where you live.";
    if (!form.consent) next.consent = "Tick the box to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setStatus("sending");
    // Nothing leaves the browser. The delay only simulates a network round trip.
    window.setTimeout(() => {
      setStatus("sent");
      onSubmitted();
    }, 900);
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
            className="rounded p-1 text-navy-700/60 hover:bg-surface-muted hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-sm text-navy">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                In the finished product a tax professional would pick this up and come
                back to you.
              </p>
            </div>
            <p className="text-sm text-navy-700/80">
              Nothing was sent. This demo keeps everything in your browser and has no
              server to send it to.
            </p>
            <PrimaryButton onClick={onClose} fullWidth>
              Close
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <DisclaimerBox variant="warning">
              Demo form. Nothing is transmitted or stored outside this browser. Use an
              invented name and address.
            </DisclaimerBox>

            <div>
              <label htmlFor="review-name" className="text-sm font-medium text-navy">
                Full name
              </label>
              <input
                ref={firstFieldRef}
                id="review-name"
                className={`mt-1 ${inputClass}`}
                value={form.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                autoComplete="off"
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
                className={`mt-1 ${inputClass}`}
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                aria-invalid={Boolean(errors.email)}
                autoComplete="off"
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
                className={`mt-1 ${inputClass}`}
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                aria-invalid={Boolean(errors.country)}
                autoComplete="off"
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
                className={`mt-1 ${inputClass}`}
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
                className={`mt-1 ${inputClass}`}
                placeholder="What would you most want a professional to look at first?"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm text-navy-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-surface-border text-accent focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
                  checked={form.consent}
                  onChange={(event) => update("consent", event.target.checked)}
                  aria-invalid={Boolean(errors.consent)}
                />
                <span>
                  I understand this is a demonstration, that the information above is
                  fictitious, and that no tax advice is being given.
                </span>
              </label>
              {errors.consent && (
                <p className="mt-1 text-xs text-alertRed" role="alert">
                  {errors.consent}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
              <PrimaryButton
                onClick={handleSubmit}
                disabled={status === "sending"}
                fullWidth
              >
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
