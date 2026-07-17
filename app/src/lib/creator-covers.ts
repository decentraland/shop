// Built-in cover templates for the store-settings picker. Every `template-cover-*` image dropped
// into src/assets/creator-covers/ is auto-discovered here (Vite's import.meta.glob resolves each to
// its bundled asset URL at build time) — add a new template by committing a `template-cover-N.*`
// file, no code change needed. The `template-cover-` prefix is required so the folder's other
// resident, `default-cover.jpeg` (the hero's fallback, see CreatorHero), stays out of the picker.
// Sorted by filename so the picker order is stable and predictable.
// NOTE: import.meta.glob does NOT resolve the `~` alias, so this pattern is relative to this file.
const modules: Record<string, string> = import.meta.glob(
  '../assets/creator-covers/template-cover-*.{jpeg,jpg,png,webp}',
  {
    eager: true,
    query: '?url',
    import: 'default'
  }
)

export type CoverTemplate = {
  name: string // the file's basename, e.g. "template-cover-1.jpeg"
  url: string // the bundled asset URL, fetched into the entity on save
}

export const COVER_TEMPLATES: CoverTemplate[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => ({ name: path.split('/').pop() as string, url }))
