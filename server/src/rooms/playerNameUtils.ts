export function sanitizePlayerName(name?: string): string {
  const trimmed = (name ?? "Player").trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : "Player";
}

export function normalizePlayerNameForComparison(name: string): string {
  return sanitizePlayerName(name).toLocaleLowerCase();
}

export function playerNamesMatch(left: string, right: string): boolean {
  return normalizePlayerNameForComparison(left) === normalizePlayerNameForComparison(right);
}
