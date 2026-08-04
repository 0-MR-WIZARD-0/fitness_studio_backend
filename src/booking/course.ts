const MS_DAY = 86400000;
const WINDOW = 7 * MS_DAY;

export function courseGroups<T extends { id: number; startsAt: Date }>(
  slots: T[],
  threshold: number,
): { groups: T[][]; countedIds: Set<number> } {
  const sorted = [...slots].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const groups: T[][] = [];
  const countedIds = new Set<number>();

  if (threshold < 1) return { groups, countedIds };

  let i = 0;
  while (i + threshold - 1 < sorted.length) {
    const first = sorted[i].startsAt.getTime();
    const last = sorted[i + threshold - 1].startsAt.getTime();
    if (last - first <= WINDOW) {
      const group = sorted.slice(i, i + threshold);
      groups.push(group);
      for (const s of group) countedIds.add(s.id);
      i += threshold;
    } else {
      i += 1;
    }
  }

  return { groups, countedIds };
}
