// Set by an editor while it holds edits that are not saved yet, so flows outside it (sign-out) can ask first.
let message: string | null = null

export function setUnsavedChanges(next: string | null): void {
  message = next
}

export function hasUnsavedChanges(): boolean {
  return message !== null
}

/** True when nothing is unsaved, or the user agreed to discard it. */
export function confirmDiscardUnsaved(): boolean {
  return message === null || window.confirm(message)
}
