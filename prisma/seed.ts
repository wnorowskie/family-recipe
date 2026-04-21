import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CLAUDE_TEST_USER_DEFAULT = 'claude-test';
const CLAUDE_TEST_EMAIL = 'claude-test@example.local';
const CLAUDE_TEST_NAME = 'Claude Test';
const CLAUDE_TEST_PASSWORD_DEFAULT = 'claude-test-password';

async function main() {
  console.log('🌱 Seeding database...');

  const existingFamily = await prisma.familySpace.findFirst();
  if (existingFamily) {
    console.log('ℹ️  Family space already exists; not overwriting master key.');
  }

  let familySpaceId: string;

  if (!existingFamily) {
    const masterKey =
      process.env.FAMILY_MASTER_KEY?.trim() || generateMasterKey();
    const masterKeyHash = await bcrypt.hash(masterKey, 12);
    const familyName = process.env.FAMILY_NAME?.trim() || 'Family Recipe';

    const familySpace = await prisma.familySpace.create({
      data: {
        name: familyName,
        masterKeyHash,
      },
    });

    console.log('✅ Created family space:', familySpace.name);
    console.log('🔑 Family Master Key:', masterKey);
    console.log('   (Save this! Users will need it to sign up)');

    const tagCategories: Record<string, string[]> = {
      'diet preference': ['vegetarian', 'vegan', 'pescatarian'],
      'allergen-safe': ['nut-free', 'dairy-free', 'gluten-free'],
      heat: ['mild', 'medium-spicy', 'spicy', 'extra-spicy'],
      'flavor notes': [
        'sweet',
        'savory',
        'tangy',
        'smoky',
        'herby',
        'garlicky',
        'umami',
        'rich',
        'fresh',
      ],
      cuisine: [
        'american',
        'italian',
        'mexican',
        'mediterranean',
        'greek',
        'indian',
        'chinese',
        'japanese',
        'thai',
        'middle-eastern',
        'latin-american',
        'fusion',
      ],
    };

    for (const [type, names] of Object.entries(tagCategories)) {
      for (const name of names) {
        await prisma.tag.upsert({
          where: { name },
          update: { type },
          create: { name, type },
        });
      }
    }

    console.log('🏷️ Seeded canonical tags');

    familySpaceId = familySpace.id;
  } else {
    familySpaceId = existingFamily.id;
  }

  await seedTestUser(familySpaceId);
}

async function seedTestUser(familySpaceId: string) {
  if (process.env.NODE_ENV === 'production') {
    console.log('⏭️  Skipping claude-test user (NODE_ENV=production)');
    return;
  }

  const username =
    process.env.CLAUDE_TEST_USER?.trim() || CLAUDE_TEST_USER_DEFAULT;
  const password =
    process.env.CLAUDE_TEST_PASSWORD?.trim() || CLAUDE_TEST_PASSWORD_DEFAULT;
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email: CLAUDE_TEST_EMAIL },
    update: { username, passwordHash, name: CLAUDE_TEST_NAME },
    create: {
      email: CLAUDE_TEST_EMAIL,
      username,
      name: CLAUDE_TEST_NAME,
      passwordHash,
    },
  });

  await prisma.familyMembership.upsert({
    where: {
      familySpaceId_userId: { familySpaceId, userId: user.id },
    },
    update: {},
    create: {
      familySpaceId,
      userId: user.id,
      role: 'member',
    },
  });

  console.log(`🧪 Seeded claude-test user (username="${username}")`);
}

function generateMasterKey() {
  // 24-character URL-safe token
  return randomBytes(18).toString('base64url').slice(0, 24);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
