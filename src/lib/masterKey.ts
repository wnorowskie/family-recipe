import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { logInfo } from '@/lib/logger';

const MASTER_KEY_SALT_ROUNDS = 12;

let cachedMasterKeyHash: string | null = null;

/**
 * Returns the bcrypt hash for the family master key sourced from env.
 * Supports either FAMILY_MASTER_KEY_HASH (preferred) or FAMILY_MASTER_KEY (plain).
 */
export async function getEnvMasterKeyHash(): Promise<string> {
  if (cachedMasterKeyHash) {
    return cachedMasterKeyHash;
  }

  const envHash = process.env.FAMILY_MASTER_KEY_HASH?.trim();
  if (envHash) {
    cachedMasterKeyHash = envHash;
    return envHash;
  }

  const envKey = process.env.FAMILY_MASTER_KEY?.trim();
  if (!envKey) {
    throw new Error('FAMILY_MASTER_KEY is not set');
  }

  cachedMasterKeyHash = await bcrypt.hash(envKey, MASTER_KEY_SALT_ROUNDS);
  return cachedMasterKeyHash;
}

/**
 * Ensures a FamilySpace exists and its stored hash matches the env hash.
 * Returns the FamilySpace record (created or updated).
 */
export async function ensureFamilySpace(masterKeyHash: string) {
  const existing = await prisma.familySpace.findFirst();

  if (existing) {
    if (existing.masterKeyHash !== masterKeyHash) {
      await prisma.familySpace.update({
        where: { id: existing.id },
        data: { masterKeyHash },
      });
      logInfo('family.master_key.synced', { familySpaceId: existing.id });
      return { ...existing, masterKeyHash };
    }

    return existing;
  }

  const familyName = process.env.FAMILY_NAME?.trim() || 'Family Recipe';

  const created = await prisma.familySpace.create({
    data: {
      name: familyName,
      masterKeyHash,
    },
  });

  logInfo('family.created_from_env', { familySpaceId: created.id, familyName });

  return created;
}

/**
 * Lightweight check to verify env master key presence without hashing secrets repeatedly.
 */
export function masterKeyEnvPresent(): boolean {
  return Boolean(
    (process.env.FAMILY_MASTER_KEY_HASH &&
      process.env.FAMILY_MASTER_KEY_HASH.trim()) ||
    (process.env.FAMILY_MASTER_KEY && process.env.FAMILY_MASTER_KEY.trim())
  );
}
