// The link in a comment email: /charts/<id>?role=<nodeId>&tab=comments. It opens the chart with that role selected and its
// Comments tab showing. Pure so it can be tested; an unknown role (deleted, or from another chart) is ignored.
export function commentDeepLink(search: string, nodeIds: Iterable<string>): { roleId: string | null; tab: 'comments' | undefined } {
  const params = new URLSearchParams(search)
  const role = params.get('role')
  const roleId = role && new Set(nodeIds).has(role) ? role : null
  return { roleId, tab: roleId && params.get('tab') === 'comments' ? 'comments' : undefined }
}
