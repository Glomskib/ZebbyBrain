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
        
        // Simple statement splitting that preserves all content
        // Only splits on semicolons outside of dollar-quoted blocks and properly handles comments
        const statements: string[] = [];
        let currentStatement = '';
        let inDollarQuote = false;
        let dollarQuoteTag = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        
        const lines = migrationSQL.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();
          
          // Skip lines that are ONLY comments (but preserve inline comments in SQL)
          if (trimmedLine.startsWith('--') && !inDollarQuote) {
            continue;
          }
          
          // Skip multi-line comment blocks (but preserve inline /* */ in SQL)
          if (trimmedLine.startsWith('/*') && trimmedLine.endsWith('*/') && !inDollarQuote) {
            continue;
          }
          
          // Track quote states character by character for this line
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const nextChar = line[j + 1];
            
            // Track single quotes (but not escaped ones)
            if (char === "'" && !inDoubleQuote && !inDollarQuote) {
              inSingleQuote = !inSingleQuote;
            }
            
            // Track double quotes (but not escaped ones)
            if (char === '"' && !inSingleQuote && !inDollarQuote) {
              inDoubleQuote = !inDoubleQuote;
            }
            
            // Track dollar quotes (only when not in regular quotes)
            if (char === '$' && !inSingleQuote && !inDoubleQuote) {
              const dollarQuoteMatch = line.substring(j).match(/^\$(\w*)\$/);
              if (dollarQuoteMatch) {
                const foundTag = dollarQuoteMatch[0];
                
                if (!inDollarQuote) {
                  inDollarQuote = true;
                  dollarQuoteTag = foundTag;
                } else if (foundTag === dollarQuoteTag) {
                  inDollarQuote = false;
                  dollarQuoteTag = '';
                }
                j += foundTag.length - 1; // Skip past the tag
              }
            }
          }
          
          currentStatement += line + '\n';
          
          // End of statement: semicolon outside of all quotes
          if (line.includes(';') && !inDollarQuote && !inSingleQuote && !inDoubleQuote) {
            const stmt = currentStatement.trim();
            if (stmt.length > 0 && !stmt.startsWith('--')) {
              statements.push(stmt.replace(/;$/, '')); // Remove trailing semicolon
            }
            currentStatement = '';
          }
        }
        
        // Add any remaining statement
        const finalStmt = currentStatement.trim();
        if (finalStmt.length > 0 && !finalStmt.startsWith('--')) {
          statements.push(finalStmt);
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
