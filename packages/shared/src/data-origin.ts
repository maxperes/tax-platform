import { z } from "zod";

export const dataOriginSchema = z.enum([
  "manual",
  "upload",
  "spreadsheet",
  "api",
  "bank",
  "broker",
  "tax_api"
]);

export type DataOrigin = z.infer<typeof dataOriginSchema>;
