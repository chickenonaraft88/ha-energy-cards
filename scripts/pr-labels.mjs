// Maps a Conventional Commits PR title to the labels that .github/release.yml groups release notes by.
// Run by .github/workflows/pr-labels.yml with PR_TITLE and PR_LABELS (comma-separated current labels) set;
// prints two lines: labels to add, then labels to remove (each comma-separated, possibly empty).
import { pathToFileURL } from 'node:url';

const TYPE_LABEL = {
  feat: 'enhancement',
  fix: 'bug',
  perf: 'bug',
  refactor: 'maintenance',
  docs: 'maintenance',
  test: 'maintenance',
  ci: 'maintenance',
  build: 'maintenance',
  chore: 'maintenance',
  deps: 'dependencies',
};

/** Every label this script owns, so it can take stale ones off when a title is edited. */
export const MANAGED = ['breaking', ...new Set(Object.values(TYPE_LABEL))];

/** Labels for a title, or null when it doesn't start with `type(scope): ` for a known type. */
export const labelsForTitle = (title) => {
  const m = /^(\w+)(?:\([^)]*\))?(!)?: \S/.exec(title.trim());
  const label = m && Object.hasOwn(TYPE_LABEL, m[1]) ? TYPE_LABEL[m[1]] : undefined;
  return label ? [label, ...(m[2] ? ['breaking'] : [])] : null;
};

/** What to add and remove so the managed labels match the title. Nothing changes for a title that doesn't parse. */
export const labelChanges = (title, current) => {
  const want = labelsForTitle(title);
  if (!want) return { add: [], remove: [] };
  return {
    add: want.filter((l) => !current.includes(l)),
    remove: current.filter((l) => MANAGED.includes(l) && !want.includes(l)),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const current = (process.env.PR_LABELS ?? '').split(',').filter(Boolean);
  const { add, remove } = labelChanges(process.env.PR_TITLE ?? '', current);
  console.log(add.join(','));
  console.log(remove.join(','));
}
