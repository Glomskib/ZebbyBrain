import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(process.env.DATABASE_URL);

// System user ID for created_by (will use first admin user if exists, or create system user)
const SYSTEM_USER_ID = 'system-groups';

async function seedGroups() {
  try {
    console.log('🌱 Seeding Zebby Social groups...\n');
    
    // First, ensure we have a system user for creating groups
    const systemUserCheck = await sql`SELECT id FROM users WHERE id = ${SYSTEM_USER_ID}`;
    
    if (systemUserCheck.length === 0) {
      console.log('Creating system user for group ownership...');
      await sql`
        INSERT INTO users (id, email, first_name, last_name)
        VALUES (${SYSTEM_USER_ID}, 'system@zebbysworld.com', 'Zebby', 'Admin')
        ON CONFLICT (id) DO NOTHING
      `;
    }
    
    // Define groups to seed
    const groupsToSeed = [
      // Age-bracket groups
      {
        slug: 'young-zebras',
        name: 'Young Zebras (18-25)',
        visibility: 'public',
        kind: 'age',
        description: 'A space for young adults (18-25) navigating EDS, college, early careers, and finding their herd.',
        rules: 'Be kind, supportive, and respectful. Share experiences, ask questions, and lift each other up. This is a safe space for young zebras.',
        tags: ['age-18-25', 'young-adults', 'college', 'early-career']
      },
      {
        slug: 'zebras-in-bloom',
        name: 'Zebras in Bloom (26-35)',
        visibility: 'public',
        kind: 'age',
        description: 'For zebras in their prime (26-35) balancing careers, relationships, family planning, and health management.',
        rules: 'Share your journey, support fellow zebras, and maintain a respectful community. Topics include career, relationships, family planning.',
        tags: ['age-26-35', 'career', 'relationships', 'family-planning']
      },
      {
        slug: 'seasoned-stripes',
        name: 'Seasoned Stripes (36-50)',
        visibility: 'public',
        kind: 'age',
        description: 'Experienced zebras (36-50) sharing wisdom, managing mid-life challenges, and supporting each other through evolving symptoms.',
        rules: 'Draw on your experience to support others. Share strategies that work, discuss mid-life EDS challenges, and build community.',
        tags: ['age-36-50', 'mid-life', 'parenting', 'career-established']
      },
      {
        slug: 'wise-zebras',
        name: 'Wise Zebras (51+)',
        visibility: 'public',
        kind: 'age',
        description: 'Our most experienced zebras (51+) sharing decades of wisdom, discussing aging with EDS, and mentoring younger members.',
        rules: 'Share your lifetime of experience. Discuss aging with EDS, retirement planning, grandparenting, and long-term health management.',
        tags: ['age-51-plus', 'senior', 'retirement', 'long-term-health']
      },
      
      // Gender/identity-specific groups
      {
        slug: 'zebra-sisters',
        name: 'Zebra Sisters',
        visibility: 'private',
        kind: 'topic',
        description: 'A private space for women and those who identify as female to discuss periods, pregnancy, menopause, and gender-specific EDS challenges.',
        rules: 'This is a safe, women-only space. Respect privacy, share openly about gender-specific health topics, and support each other.',
        tags: ['women', 'pregnancy', 'periods', 'menopause', 'pelvic-health']
      },
      {
        slug: 'zebra-brothers',
        name: 'Zebra Brothers',
        visibility: 'private',
        kind: 'topic',
        description: 'A private space for men and those who identify as male to discuss masculinity, relationships, and male-specific EDS experiences.',
        rules: 'This is a safe, men-only space. Share experiences specific to being male with EDS, discuss relationships, mental health, and more.',
        tags: ['men', 'masculinity', 'mens-health', 'relationships']
      },
      {
        slug: 'rainbow-zebras',
        name: 'Rainbow Zebras (LGBTQ+)',
        visibility: 'private',
        kind: 'topic',
        description: 'A safe space for LGBTQ+ zebras to discuss identity, healthcare navigation, hormone therapy impacts, and finding affirming care.',
        rules: 'This is an inclusive LGBTQ+ space. Respect all identities, share resources for affirming care, and build community.',
        tags: ['lgbtq', 'transgender', 'non-binary', 'queer', 'affirming-care']
      },
      
      // Diagnosis-specific groups
      {
        slug: 'heds-herd',
        name: 'hEDS Herd',
        visibility: 'public',
        kind: 'diagnosis',
        description: 'For those diagnosed with Hypermobile Ehlers-Danlos Syndrome. Share symptoms, treatments, and daily management strategies.',
        rules: 'Share experiences specific to hEDS. Support each other, discuss treatments, and share what works for managing symptoms.',
        tags: ['hEDS', 'hypermobile', 'joint-pain', 'dislocations']
      },
      {
        slug: 'pots-squad',
        name: 'POTS Squad',
        visibility: 'public',
        kind: 'diagnosis',
        description: 'For zebras with Postural Orthostatic Tachycardia Syndrome. Discuss heart rate management, salt loading, and coping strategies.',
        rules: 'Focus on POTS-specific topics: dysautonomia, heart rate, blood pressure, salt protocols, compression garments, and symptom management.',
        tags: ['POTS', 'dysautonomia', 'heart-rate', 'salt-loading']
      },
      {
        slug: 'mcas-warriors',
        name: 'MCAS Warriors',
        visibility: 'public',
        kind: 'diagnosis',
        description: 'For those with Mast Cell Activation Syndrome. Share trigger management, medication protocols, and safe product recommendations.',
        rules: 'Discuss MCAS triggers, safe products, medications, and managing allergic reactions. Share what helps your mast cells stay calm.',
        tags: ['MCAS', 'mast-cell', 'allergies', 'histamine']
      }
    ];
    
    let seededCount = 0;
    
    for (const group of groupsToSeed) {
      console.log(`📦 Seeding group: ${group.name}`);
      
      try {
        // Check if group already exists
        const existing = await sql`SELECT id FROM groups WHERE slug = ${group.slug}`;
        
        if (existing.length > 0) {
          console.log(`   ⏭️  Group already exists, skipping\n`);
          continue;
        }
        
        // Insert the group
        const result = await sql`
          INSERT INTO groups (slug, name, visibility, kind, description, rules, created_by)
          VALUES (
            ${group.slug},
            ${group.name},
            ${group.visibility},
            ${group.kind},
            ${group.description},
            ${group.rules},
            ${SYSTEM_USER_ID}
          )
          RETURNING id
        `;
        
        const groupId = result[0].id;
        
        // Insert tags for this group
        for (const tag of group.tags) {
          await sql`
            INSERT INTO group_tags (group_id, tag)
            VALUES (${groupId}, ${tag})
          `;
        }
        
        console.log(`   ✅ Created with ${group.tags.length} tags\n`);
        seededCount++;
      } catch (error) {
        console.error(`   ❌ Failed to seed group:`, error);
      }
    }
    
    console.log(`\n🎉 Successfully seeded ${seededCount} groups`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  }
}

seedGroups().catch(console.error);
