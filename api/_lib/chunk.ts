// Postgres allows ~65k bind parameters per statement. A node row binds ~15, so a
// multi-thousand-row insert must be split. 500 rows × ~15 columns stays well under.
export const INSERT_CHUNK = 500

export function chunk<T>(rows: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}
