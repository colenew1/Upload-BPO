export const selectRowsById = <T extends { id: string }>(
  rows: T[],
  allowedIds?: string[],
) => {
  if (!allowedIds || allowedIds.length === 0) {
    return rows;
  }
  const idSet = new Set(allowedIds);
  return rows.filter((row) => idSet.has(row.id));
};

