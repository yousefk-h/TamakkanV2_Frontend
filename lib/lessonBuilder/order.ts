/** Drop slots are numbered 0..N, before, between and after lesson blocks. */
export function insertLessonBlock<T>(items: T[], block: T, slot: number): T[] {
  if (!Number.isInteger(slot) || slot < 0 || slot > items.length) return items;
  const next = [...items];
  next.splice(slot, 0, block);
  return next;
}

export function moveLessonBlock<T>(items: T[], from: number, slot: number): T[] {
  if (!Number.isInteger(from) || from < 0 || from >= items.length ||
      !Number.isInteger(slot) || slot < 0 || slot > items.length ||
      from === slot || from + 1 === slot) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(from < slot ? slot - 1 : slot, 0, moved);
  return next;
}
