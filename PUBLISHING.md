# Publishing statewave-ts to npm

## Pre-flight

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated
- [ ] README.md accurate
- [ ] `git tag v{version}`

## Publish

```bash
npm run build
npm publish --dry-run        # review contents
npm publish                  # or: npm publish --access public
```

## Verify

```bash
npm info statewave-ts
npx -p statewave-ts node -e "import('statewave-ts').then(m => console.log(Object.keys(m)))"
```
