// Carries a single dropped/selected File from the landing hero to the editor
// across an in-app navigation. Deliberately ephemeral: a File survives a
// route change but not a page refresh, so consuming it once and clearing it
// makes the "polish this, then forget it" semantics explicit and testable.

let pending: File | null = null

export function setPendingUpload(file: File): void {
  pending = file
}

export function consumePendingUpload(): File | null {
  const f = pending
  pending = null
  return f
}
