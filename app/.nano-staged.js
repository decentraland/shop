// Tasks run against staged files. Globs are matched relative to app/, but
// nano-staged executes the task commands from the git-repo root — so the
// project-wide typecheck must `cd app` before running its npm script.
// (String tasks like eslint/prettier get absolute file paths appended, so
// they don't need this.)
//
// Note: nano-staged's globber does not support nested brace groups, so the
// typecheck trigger is split across separate keys rather than one combined glob.
const typecheck = () => 'npm --prefix app run typecheck'

export default {
  'src/**/*.{js,mjs,cjs,ts,tsx}': 'eslint --fix',
  '**/*.{js,mjs,cjs,ts,tsx,json,css,html}': 'prettier --write --log-level=error',
  'src/**/*.{ts,tsx}': typecheck,
  'tsconfig*.json': typecheck,
  'package.json': typecheck
}
