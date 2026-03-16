## 1. Remove compile exports from main index

- [x] 1.1 Delete the `export { compileFile, transformYamlToWorkflow }` line from `src/index.ts`
- [x] 1.2 Run `bun run build` and confirm it completes without errors
- [x] 1.3 Compare bundle size before/after: `ls -lh dist/index.js dist/index.cjs`

## 2. Verify correct export surface

- [x] 2.1 Confirm `compileFile` is absent from main entry: `node -e "import('./dist/index.js').then(m => console.log('compileFile' in m))"`  → must print `false`
- [x] 2.2 Confirm `compileFile` still works via sub-path: `node -e "import('./dist/cli/compile.js').then(m => console.log(typeof m.compileFile))"` → must print `function`
- [x] 2.3 Run `bun test` — all tests must pass

## 3. Update README if needed

- [x] 3.1 Search README for any `compileFile` import from `"orinocoflow"` (not `"orinocoflow/compile"`) and update to the sub-path import
