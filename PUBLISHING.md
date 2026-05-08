# Publishing @statewavedev/sdk

> Renamed from `statewave-ts` in v0.7.0. The CI publish path stays the same; only the published package name changes.

Releases are automated via GitHub Actions. Pushing a `v*` tag triggers CI, builds the package, publishes to npm, and creates a GitHub Release.

## Prerequisites — one-time scope setup

The **`statewavedev`** npm organization is already created (replaces the unavailable `@statewave` scope). To publish:

1. Add `smaramwbc` (and any other release maintainers) to the org with publish rights.
2. Generate a Granular Access Token scoped to the `@statewavedev` organization with **publish** access for `@statewavedev/sdk`.
3. Add the token as the `NPM_TOKEN` repo secret on GitHub. (Replace any prior `statewave-ts`-scoped token.)

Verify with:

```bash
npm whoami --registry=https://registry.npmjs.org
npm access list packages @statewavedev   # must include @statewavedev/sdk after first publish
```

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

## Legacy `statewave-ts` handling

The pre-public `statewave-ts` package on npm (last published 0.6.3) is no longer used. After the first `@statewavedev/sdk` publish, deprecate it without publishing a fake compatibility version:

```bash
npm deprecate "statewave-ts@*" "Renamed to @statewavedev/sdk. Run: npm install @statewavedev/sdk"
```

This points existing `npm install statewave-ts` invocations at the new name without shipping a placeholder release. Do **not** publish 0.7.x or higher under the old name.

## Manual publish (fallback)

If automation fails, publish manually after the org is set up:

```bash
npm whoami                            # confirm you're logged in as a @statewavedev org member
npm run build
npm publish --provenance --access public
```

`access: public` and `provenance: true` are also set in `package.json`'s `publishConfig`, so the bare `npm publish` form works after the org is configured.
