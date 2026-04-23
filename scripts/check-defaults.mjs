import { PGlite } from "@electric-sql/pglite";
const client = new PGlite("./.data/pglite");
await client.waitReady;
const res = await client.query(`
  SELECT table_name, column_name, column_default
  FROM information_schema.columns
  WHERE column_name = 'id'
    AND table_schema = 'public'
  ORDER BY table_name
  LIMIT 40;
`);
for (const r of res.rows) console.log(r.table_name.padEnd(30), r.column_default ?? '(none)');
await client.close();
