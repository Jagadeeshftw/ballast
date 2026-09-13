import postgres from "postgres";

let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  // Do not print errors from the driver: connection errors can contain credentials.
  return connection ??= postgres(process.env.DATABASE_URL, {
    onnotice: () => {},
    max: 4, idle_timeout: 20, connect_timeout: 10, prepare: false,
    connection: { application_name: "ballast-convenience", statement_timeout: 20000 },
  });
}
export async function closeDb() { if (connection) await connection.end({ timeout: 5 }); }
