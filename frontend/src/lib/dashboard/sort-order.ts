/**
 * The sort order for a new item at the end of a list: one past the largest. Not the list's length, which collides
 * once items were deleted or moved (a list ordered 0, 2, 3 has length 3).
 */
export function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
}
