import { randomUUID } from "node:crypto";
import { createDatabase } from "../server/database";
import { createDemoState } from "../packages/domain/index";
import { createApp } from "../server/app";
import type { Request, Response } from "express";
let application: Promise<ReturnType<typeof createApp>> | undefined;
export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.DATABASE_URL) {
    res
      .status(503)
      .json({
        schemaVersion: "1.0",
        error: {
          code: "source_unavailable",
          message: "Hosted demonstration storage is not configured.",
        },
        requestId: randomUUID(),
      });
    return;
  }
  try {
    application ??= createDatabase(createDemoState, {
      connectionString: process.env.DATABASE_URL,
    })
      .then(createApp)
      .catch((error) => {
        application = undefined;
        throw error;
      });
    (await application)(req, res);
  } catch {
    res
      .status(503)
      .json({
        schemaVersion: "1.0",
        error: {
          code: "source_unavailable",
          message: "Hosted demonstration storage is unavailable.",
        },
        requestId: randomUUID(),
      });
  }
}
