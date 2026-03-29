const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;
const textEncoder = new TextEncoder();

export function stableHash(input: string): number {
  let hash = FNV1A_OFFSET_BASIS;

  for (const byte of textEncoder.encode(input)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV1A_PRIME);
  }

  return hash >>> 0;
}

export function getRolloutBucket(
  flagKey: string,
  environmentId: string,
  subjectKey: string,
): number {
  return stableHash(`${flagKey}:${environmentId}:${subjectKey}`) % 10_000;
}

export function getRolloutThreshold(rolloutPercentage: number): number {
  if (!Number.isFinite(rolloutPercentage)) {
    return 0;
  }

  const normalized = Math.max(0, Math.min(100, rolloutPercentage));
  return Math.floor(normalized * 100);
}
