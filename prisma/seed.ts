import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create the family master key (this needs to be changed)
  const masterKey = 'seed-master-key-placeholder';
  const masterKeyHash = await bcrypt.hash(masterKey, 10);

  // Create the family space
  const familySpace = await prisma.familySpace.create({
    data: {
      name: 'Wnorowski Family',
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
