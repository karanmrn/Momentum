import { z } from "zod";
import { pilotSchema } from "../packages/contracts/index.js";
export const accountIdSchema = z.string().uuid();
export const privateReportInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    pilotId: pilotSchema,
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000),
    sourceBasis: z.enum(["firsthand", "other_source"]),
  })
  .strict();
export const followInputSchema = z
  .object({
    pilotIds: z
      .array(pilotSchema)
      .max(3)
      .refine((a) => new Set(a).size === a.length),
    categories: z
      .array(z.enum(["infrastructure", "community", "transport"]))
      .max(3)
      .refine((a) => new Set(a).size === a.length),
    paused: z.boolean(),
  })
  .strict();
export type PrivateReportInput = z.infer<typeof privateReportInputSchema>;
export type FollowInput = z.infer<typeof followInputSchema>;
export class PrivateAccountError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PrivateAccountError";
  }
}
