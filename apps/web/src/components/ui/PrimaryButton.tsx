import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  href?: string;
  fullWidth?: boolean;
}

export function PrimaryButton({
  children,
  href,
  fullWidth,
  className = "",
  ...rest
}: Props) {
  const classes = `${BASE} ${fullWidth ? "w-full" : ""} ${className}`;
  if (href) {
    return (
      <Link to={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
