import { readFile } from "node:fs/promises";
import { db, closeDb } from "./db";
async function main() {
  const sql = await readFile(new URL("./migrations/001.sql", import.meta.url), "utf8");
  await db().begin(async tx => { await tx.unsafe(sql); });
  console.log("Ballast convenience schema is ready.");
}
main().catch(() => { console.error("Schema migration failed. Check DATABASE_URL and database permissions; credentials were not logged."); process.exitCode = 1; }).finally(closeDb);
