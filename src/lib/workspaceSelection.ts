// Which workspace the app is acting on (roadmap 1.2: multiple workspaces).
// Remembered per browser so the user returns to the workspace they used last.
// The server checks membership on every request, so this is only a preference.

const KEY = 'stratmap_workspace_id'

export function getSelectedWorkspaceId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setSelectedWorkspaceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: requests fall back to the first workspace.
  }
}

/** Switches workspace and reloads, so every store starts clean for the new workspace. */
export function switchWorkspace(id: string, path = '/dashboard'): void {
  setSelectedWorkspaceId(id)
  window.location.assign(path)
}
