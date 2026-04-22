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

  const testUserId = await seedTestUser(familySpaceId);
  if (testUserId) {
    await seedE2EFixtures(familySpaceId, testUserId);
  }
}

async function seedTestUser(familySpaceId: string): Promise<string | null> {
  if (process.env.NODE_ENV === 'production') {
    console.log('⏭️  Skipping claude-test user (NODE_ENV=production)');
    return null;
  }

  const username =
    process.env.CLAUDE_TEST_USER?.trim() || CLAUDE_TEST_USER_DEFAULT;
  const password =
    process.env.CLAUDE_TEST_PASSWORD?.trim() || CLAUDE_TEST_PASSWORD_DEFAULT;
  const passwordHash = await bcrypt.hash(password, 10);

  // Username is set on create only. Rotating CLAUDE_TEST_USER between runs
  // would otherwise hit the User.username unique constraint if another row
  // already holds the new value. To rotate, delete the row and re-seed.
  const user = await prisma.user.upsert({
    where: { email: CLAUDE_TEST_EMAIL },
    update: { passwordHash, name: CLAUDE_TEST_NAME },
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
  return user.id;
}

// Deterministic fixture IDs — Playwright specs assert by content/ID.
const E2E_POST_ID = 'e2e-post-001';
const E2E_COMMENT_ID = 'e2e-comment-001';
const E2E_REACTION_ID = 'e2e-reaction-001';
const E2E_RECIPE_POST_ID = 'e2e-recipe-001';
const E2E_RECIPE_DETAILS_ID = 'e2e-recipe-details-001';
const E2E_COOKED_EVENT_ID = 'e2e-cooked-001';
const E2E_NOTIFICATION_ID = 'e2e-notification-001';

async function seedE2EFixtures(familySpaceId: string, userId: string) {
  if (process.env.SEED_E2E !== '1') return;
  if (process.env.NODE_ENV === 'production') {
    console.log('⏭️  Skipping E2E fixtures (NODE_ENV=production)');
    return;
  }

  const postData = {
    familySpaceId,
    authorId: userId,
    title: 'E2E Seed Post',
    caption: 'Deterministic post for Playwright smoke suite',
    hasRecipeDetails: false,
  };
  await prisma.post.upsert({
    where: { id: E2E_POST_ID },
    update: postData,
    create: { id: E2E_POST_ID, ...postData },
  });

  const commentData = {
    postId: E2E_POST_ID,
    authorId: userId,
    text: 'E2E seed comment',
  };
  await prisma.comment.upsert({
    where: { id: E2E_COMMENT_ID },
    update: commentData,
    create: { id: E2E_COMMENT_ID, ...commentData },
  });

  const reactionData = {
    targetType: 'post',
    targetId: E2E_POST_ID,
    userId,
    emoji: '❤️',
    postId: E2E_POST_ID,
  };
  await prisma.reaction.upsert({
    where: { id: E2E_REACTION_ID },
    update: reactionData,
    create: { id: E2E_REACTION_ID, ...reactionData },
  });

  const recipePostData = {
    familySpaceId,
    authorId: userId,
    title: 'E2E Seed Recipe',
    caption: 'Deterministic recipe for Playwright smoke suite',
    hasRecipeDetails: true,
  };
  await prisma.post.upsert({
    where: { id: E2E_RECIPE_POST_ID },
    update: recipePostData,
    create: { id: E2E_RECIPE_POST_ID, ...recipePostData },
  });

  const recipeDetailsData = {
    postId: E2E_RECIPE_POST_ID,
    ingredients: '1 cup flour\n1 cup sugar',
    steps: '1. Mix.\n2. Bake at 350F for 20 minutes.',
    totalTime: 30,
    servings: 4,
    difficulty: 'easy',
  };
  await prisma.recipeDetails.upsert({
    where: { id: E2E_RECIPE_DETAILS_ID },
    update: recipeDetailsData,
    create: { id: E2E_RECIPE_DETAILS_ID, ...recipeDetailsData },
  });

  const cookedEventData = {
    postId: E2E_RECIPE_POST_ID,
    userId,
    rating: 5,
    note: 'E2E seed cooked event',
  };
  await prisma.cookedEvent.upsert({
    where: { id: E2E_COOKED_EVENT_ID },
    update: cookedEventData,
    create: { id: E2E_COOKED_EVENT_ID, ...cookedEventData },
  });

  // V1 only seeds one user, so actor == recipient here. The DB allows it;
  // UI business logic that filters self-notifications is validated in tests,
  // not at seed time.
  const notificationData = {
    familySpaceId,
    recipientId: userId,
    actorId: userId,
    type: 'comment',
    postId: E2E_POST_ID,
    commentId: E2E_COMMENT_ID,
  };
  await prisma.notification.upsert({
    where: { id: E2E_NOTIFICATION_ID },
    update: notificationData,
    create: { id: E2E_NOTIFICATION_ID, ...notificationData },
  });

  console.log('🧪 Seeded E2E fixtures (SEED_E2E=1)');
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
