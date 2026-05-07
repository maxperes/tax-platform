/* eslint-disable @typescript-eslint/no-namespace */
import type { AuthPayload } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
