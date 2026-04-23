import * as schema from "@shared/schema";

const connStr = process.env.DATABASE_URL ?? "";
const useLocal =
  !connStr ||
  connStr.startsWith("pglite://") ||
  connStr === "local" ||
  process.env.USE_PGLITE === "true";

type AnyPool = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
};

export let pool: AnyPool;
export let db: any;
export const isLocalDb = useLocal;

if (useLocal) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const path = await import("node:path");
  const fs = await import("node:fs");

  const dataDir = connStr.startsWith("pglite://")
    ? connStr.slice("pglite://".length)
    : path.resolve(process.cwd(), ".data/pglite");

  fs.mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);
  await client.waitReady;
  db = drizzle(client, { schema });
  pool = {
    async query(text: string, params?: any[]) {
      const res: any = await client.query(text, params);
      return { rows: res.rows ?? [], rowCount: res.affectedRows ?? res.rows?.length ?? 0 };
    },
  };
  console.log(`[db] Using local PGlite at ${dataDir}`);
} else {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const ws = (await import("ws")).default;
  neonConfig.webSocketConstructor = ws;
  const neonPool = new Pool({ connectionString: connStr });
  db = drizzle({ client: neonPool, schema });
  pool = neonPool as unknown as AnyPool;
  console.log("[db] Using Neon serverless Postgres");
}
