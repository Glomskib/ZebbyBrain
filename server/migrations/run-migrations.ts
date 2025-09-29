import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = neon(process.env.DATABASE_URL!);

async function runMigrations() {
  try {
    console.log('🔄 Running Wave 1 migrations...');
    
    const migrationPath = join(__dirname, '001_wave1_weather_bodyparts.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Split into individual statements and filter out comments/empty lines
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
    
    console.log(`Found ${statements.length} migration statements to execute`);
    
    for (const statement of statements) {
      if (statement.includes('ALTER TABLE') || statement.includes('CREATE INDEX')) {
        console.log(`Executing: ${statement.substring(0, 60)}...`);
        await sql(statement);
      }
    }
    
    console.log('✅ Wave 1 migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

runMigrations().catch(console.error);
