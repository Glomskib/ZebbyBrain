/**
 * Generates CREATE TABLE statements directly from the drizzle schema and
 * applies them against the current DB connection.
 *
 * This is a dev-friendly, idempotent "push" for PGlite. Every statement uses
 * IF NOT EXISTS so it's safe to run on every boot.
 */
import * as schema from "@shared/schema";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sql as sqlTag } from "drizzle-orm";
import { pool } from "../db";

type ColConfig = ReturnType<typeof getTableConfig>["columns"][number];

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function columnTypeSql(col: ColConfig): string {
  // drizzle columns expose a `getSQLType()` in recent versions; fall back to
  // a reasonable map using the internal `columnType` name.
  const anyCol: any = col as any;
  if (typeof anyCol.getSQLType === "function") {
    try {
      return anyCol.getSQLType();
    } catch {
      // fall through to manual map
    }
  }
  const kind: string = anyCol.columnType || anyCol.dataType || "varchar";
  const map: Record<string, string> = {
    PgVarchar: "VARCHAR",
    PgText: "TEXT",
    PgInteger: "INTEGER",
    PgSmallInt: "SMALLINT",
    PgBigInt: "BIGINT",
    PgBoolean: "BOOLEAN",
    PgTimestamp: "TIMESTAMP",
    PgTimestampTz: "TIMESTAMPTZ",
    PgDate: "DATE",
    PgNumeric: "NUMERIC",
    PgDecimal: "NUMERIC",
    PgReal: "REAL",
    PgDoublePrecision: "DOUBLE PRECISION",
    PgJson: "JSON",
    PgJsonb: "JSONB",
    PgUuid: "UUID",
    PgSerial: "SERIAL",
    PgBigSerial: "BIGSERIAL",
  };
  return map[kind] || "TEXT";
}

function defaultSql(col: ColConfig): string | null {
  const anyCol: any = col as any;
  if (anyCol.default === undefined) return null;
  const d = anyCol.default;
  if (d === null) return null;
  // drizzle sql`` template → look at queryChunks for raw SQL bits only
  if (d && typeof d === "object") {
    const chunks = (d as any).queryChunks;
    if (Array.isArray(chunks)) {
      // Chunk shapes seen:
      //   "gen_random_uuid()"                  (bare string)
      //   StringChunk { value: ["gen_random_uuid()"] }   (array of strings)
      //   StringChunk { value: "gen_..." }       (string)
      const parts: string[] = [];
      for (const c of chunks) {
        if (typeof c === "string") {
          parts.push(c);
        } else if (c && typeof c === "object" && "value" in c) {
          const v = (c as any).value;
          if (typeof v === "string") parts.push(v);
          else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === "string").join(""));
          else return null;
        } else {
          return null;
        }
      }
      const joined = parts.join("").trim();
      if (!joined) return null;
      return joined;
    }
    // Unknown object shape — don't emit a default
    return null;
  }
  if (typeof d === "string") return `'${d.replace(/'/g, "''")}'`;
  if (typeof d === "number") return String(d);
  if (typeof d === "boolean") return d ? "TRUE" : "FALSE";
  return null;
}

function isArrayCol(col: ColConfig): boolean {
  const anyCol: any = col as any;
  return !!anyCol.baseColumn || !!anyCol.isArray;
}

function columnDef(col: ColConfig): string {
  const anyCol: any = col as any;
  const name = quoteIdent(col.name);
  let type = columnTypeSql(col);
  if (isArrayCol(col)) type = `${type}[]`;
  let piece = `${name} ${type}`;
  if (col.primary) piece += " PRIMARY KEY";
  if (col.notNull) piece += " NOT NULL";
  if (anyCol.isUnique || col.isUnique) piece += " UNIQUE";

  // Handle default
  const hasDefault = anyCol.hasDefault || anyCol.default !== undefined;
  if (hasDefault) {
    const def = defaultSql(col);
    if (def !== null) piece += ` DEFAULT ${def}`;
  }
  return piece;
}

export async function syncSchema() {
  const tables = Object.values(schema).filter((v: any) => {
    // pgTable objects expose a special symbol we can detect via getTableConfig
    if (!v || typeof v !== "object") return false;
    try {
      getTableConfig(v as any);
      return true;
    } catch {
      return false;
    }
  }) as any[];

  for (const tbl of tables) {
    try {
      const cfg = getTableConfig(tbl);
      const cols = cfg.columns.map(columnDef);
      const ddl = `CREATE TABLE IF NOT EXISTS ${quoteIdent(cfg.name)} (\n  ${cols.join(",\n  ")}\n);`;
      try {
        await pool.query(ddl);
      } catch (e: any) {
        // ignore "already exists" and type-mismatch noise
        const msg = e?.message || "";
        if (/already exists|duplicate/i.test(msg)) {
          // fine
        } else {
          console.warn(`[schemaSync] ${cfg.name}: ${msg.slice(0, 160)}`);
        }
      }

      // Add any missing columns (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
      for (const col of cfg.columns) {
        const colDef = columnDef(col);
        // Strip PRIMARY KEY / UNIQUE because ALTER ADD COLUMN doesn't accept table constraints here
        const safe = colDef
          .replace(/\s+PRIMARY KEY/gi, "")
          .replace(/\s+UNIQUE/gi, "");
        const alter = `ALTER TABLE ${quoteIdent(cfg.name)} ADD COLUMN IF NOT EXISTS ${safe};`;
        try {
          await pool.query(alter);
        } catch (e: any) {
          const msg = e?.message || "";
          if (!/already exists|duplicate/i.test(msg)) {
            // swallow — best-effort
          }
        }
      }

      // Indexes (best-effort)
      for (const idx of cfg.indexes || []) {
        const anyIdx: any = idx as any;
        const columns = anyIdx.config?.columns || anyIdx.columns || [];
        const colNames = columns
          .map((c: any) => (typeof c === "string" ? c : c.name || c.column?.name))
          .filter(Boolean)
          .map(quoteIdent);
        const idxName = anyIdx.config?.name || anyIdx.name;
        if (!colNames.length || !idxName) continue;
        const unique = anyIdx.config?.unique || anyIdx.unique ? "UNIQUE " : "";
        const stmt = `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(cfg.name)} (${colNames.join(", ")});`;
        try {
          await pool.query(stmt);
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      console.warn("[schemaSync] table error:", e?.message);
    }
  }

  // Add a couple of FK-free indexes that the code expects and that are safe.
  const extraIndexes = [
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions(expire);`,
  ];
  for (const s of extraIndexes) {
    try {
      await pool.query(s);
    } catch {
      /* noop */
    }
  }
}

// Keep imports from being dead-code eliminated
export const _imports = { sqlTag };
