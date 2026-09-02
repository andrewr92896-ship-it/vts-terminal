// Deliberately its own module with no component imports: Portal needs this set
// eagerly to decide what to route, and importing it from index.tsx would pull
// the whole Site Editor into the main bundle and undo the lazy chunk.
export const SITE_SCREENS = new Set(['site_editor', 'site_view', 'site_files']);
