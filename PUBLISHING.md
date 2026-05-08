# Publishing @statewavedev/sdk

Releases are automated via GitHub Actions. Pushing a `v*` tag triggers CI, builds the package, publishes to npm with provenance, and creates a GitHub Release.

## Prerequisites — one-time setup

1. Add release maintainers to the **`statewavedev`** npm organization with publish rights.
2. Generate a Granular Access Token scoped to `@statewavedev` with publish access for `@statewavedev/sdk` (Bypass 2FA enabled, since CI cannot prompt for OTPs).
3. Add the token as the `NPM_TOKEN` repo secret on GitHub.

Verify with:

```bash
npm whoami --registry=https://registry.npmjs.org
npm access list packages @statewavedev
```

## Release process

1. **Update version** in `package.json`.
2. **Update CHANGELOG.md** with the new version and date.
3. **Commit** to main:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "release: v0.X.Y"
   git push
   ```
4. **Wait for CI to pass** on the main branch push.
5. **Tag and push**:
   ```bash
   git tag v0.X.Y
   git push --tags
   ```
6. The `release.yml` workflow will:
   - Run CI (build + tests)
   - Build the package
   - Publish `@statewavedev/sdk` to npm with provenance
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
- [ ] npm package updated: `npm view @statewavedev/sdk`
- [ ] Install works: `npm install @statewavedev/sdk@0.X.Y`
- [ ] CHANGELOG version matches tag
- [ ] Provenance attestation present: `npm view @statewavedev/sdk dist.attestations`

## Manual publish (fallback)

If automation fails:

```bash
npm whoami                              # confirm you're logged in as a @statewavedev org member
npm run build
npm publish --provenance --access public
```

`access: public` and `provenance: true` are set in `package.json`'s `publishConfig`, so the bare `npm publish` form works.
