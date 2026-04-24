# Publishing statewave-ts

Releases are automated via GitHub Actions. Pushing a `v*` tag triggers CI, builds the package, publishes to npm, and creates a GitHub Release.

## Release process

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with the new version and date
3. **Commit** to main:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "release: v0.X.Y"
   git push
   ```
4. **Wait for CI to pass** on the main branch push
5. **Tag and push**:
   ```bash
   git tag v0.X.Y
   git push --tags
   ```
6. The `release.yml` workflow will:
   - Run CI (build + tests)
   - Build the package
   - Publish to npm with provenance
   - Create a GitHub Release

## Pre-flight checklist

- [ ] All tests pass locally: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated with version and date
- [ ] README.md is accurate
- [ ] CI passes on main before tagging

## Post-release verification

- [ ] GitHub Release exists at `https://github.com/smaramwbc/statewave-ts/releases`
- [ ] npm package updated: `npm info statewave-ts`
- [ ] Install works: `npm install statewave-ts@0.X.Y`
- [ ] CHANGELOG version matches tag

## Required GitHub settings

- **NPM_TOKEN** secret must be configured:
  1. Go to https://www.npmjs.com → Access Tokens → Generate (Granular, publish scope for `statewave-ts`)
  2. Go to https://github.com/smaramwbc/statewave-ts → Settings → Secrets → Actions
  3. Add secret `NPM_TOKEN`

## Manual publish (fallback)

If automation fails, publish manually:

```bash
npm run build
npm publish --access public
```
