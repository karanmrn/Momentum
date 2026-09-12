import { createDatabase, type DemoDatabase } from "../server/database.js";
import { createDemoState } from "../packages/domain/index.js";
import { createApp } from "../server/app.js";
import type { Request, Response } from "express";

let database: Promise<DemoDatabase> | undefined;
const application = createApp(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Hosted demonstration storage is not configured.");
  database ??= createDatabase(createDemoState, {
    connectionString: process.env.DATABASE_URL,
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
});

export default function handler(request: Request, response: Response) {
  application(request, response);
}
