// Department lookup for a role (launch review R-47).
//
// A role's `departmentId` can name a *chart* department (a chart made from a template has its own, with new ids) or a *workspace*
// department (a blank chart mirrors the workspace's list). Looking it up in only one list showed the raw id on the other kind of
// chart, and no colour at all on a public share page, which has no workspace departments. Always look in the chart's own first.

export interface DepartmentLike { id: string; name: string; colour: string }

/** The chart's own departments, then the workspace ones the chart does not already have (matched by id). */
export function mergeDepartments(chart: readonly DepartmentLike[], workspace: readonly DepartmentLike[]): DepartmentLike[] {
  const seen = new Set(chart.map(d => d.id))
  return [...chart, ...workspace.filter(d => !seen.has(d.id))]
}

export function findDepartment<T extends { id: string }>(list: readonly T[], id: string | null | undefined): T | undefined {
  return id ? list.find(d => d.id === id) : undefined
}

/** What to show for a role's department. Never an id: a department that was deleted reads "Unknown department". */
export function departmentLabel(dept: { name: string } | null | undefined, id: string | null | undefined): string {
  if (dept) return dept.name
  return id ? 'Unknown department' : 'Not set'
}
