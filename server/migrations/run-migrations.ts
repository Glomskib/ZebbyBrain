import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(process.env.DATABASE_URL);

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...\n');
    
    // Get all SQL migration files and sort them alphabetically
    const migrationFiles = readdirSync(__dirname)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensures 001, 002, 003, etc. run in order
    
    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found');
      return;
    }
    
    console.log(`Found ${migrationFiles.length} migration file(s):\n${migrationFiles.map(f => `  - ${f}`).join('\n')}\n`);
    
    let totalMigrations = 0;
    
    for (const file of migrationFiles) {
      console.log(`📦 Running migration: ${file}`);
      
      try {
        const migrationPath = join(__dirname, file);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        
        // Split into individual statements, but handle $$ blocks (PL/pgSQL functions)
        const statements: string[] = [];
        let currentStatement = '';
        let inDollarQuote = false;
        
        const lines = migrationSQL.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // Skip comment-only lines
          if (trimmedLine.startsWith('--') || trimmedLine.startsWith('/*') || trimmedLine.length === 0) {
            continue;
          }
          
          // Track $$ blocks
          if (trimmedLine.includes('$$')) {
            inDollarQuote = !inDollarQuote;
          }
          
          currentStatement += line + '\n';
          
          // End of statement: semicolon outside of $$ block
          if (line.includes(';') && !inDollarQuote) {
            const stmt = currentStatement.trim();
            if (stmt.length > 0) {
              statements.push(stmt.replace(/;$/, '')); // Remove trailing semicolon
            }
            currentStatement = '';
          }
        }
        
        // Add any remaining statement
        if (currentStatement.trim().length > 0) {
          statements.push(currentStatement.trim());
        }
        
        console.log(`   Found ${statements.length} statement(s)`);
        
        for (const statement of statements) {
          const preview = statement.substring(0, 70).replace(/\s+/g, ' ');
          console.log(`   Executing: ${preview}...`);
          await sql(statement);
        }
        
        console.log(`   ✅ ${file} completed\n`);
        totalMigrations++;
      } catch (error) {
        console.error(`   ❌ ${file} failed:`, error);
        throw error;
      }
    }
    
    console.log(`\n🎉 Successfully ran ${totalMigrations} migration(s)`);
  } catch (error) {
    console.error('\n❌ Migration process failed:', error);
    throw error;
  }
}

runMigrations().catch(console.error);
