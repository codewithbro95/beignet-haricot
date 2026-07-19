# Releasing

Releases are created from `main`. Day-to-day work belongs on `develop` or a short-lived branch targeting `develop`.

## Release Checklist

1. Update `version` in `app.config.json` using three-part semantic versioning.
2. Add a concise, user-facing `## X.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`.
3. Run `npm run sync:config` and `npm run release:check`.
4. Merge the release changes from `develop` into `main`.

If `vX.Y.Z` is not already published, the release workflow builds:

- a universal macOS DMG
- Windows NSIS and MSI installers
- Linux AppImage and Debian packages

The workflow prepares a private draft, then each platform uploads its installers independently. The first successful platform build publishes `vX.Y.Z` with notes from `CHANGELOG.md`; installers from other successful platforms are added as their builds finish. A failure on one platform does not block downloads from the others.

## Signing

macOS artifacts use an ad-hoc signature so Apple Silicon can run the downloaded application, but they are not Apple-notarized. Windows installers are not certificate-signed. Production identity signing can be added later through protected GitHub secrets without changing the version-triggered release flow.

The workflow needs no personal GitHub token. GitHub provides a repository-scoped `GITHUB_TOKEN`, and the release job receives only `contents: write` permission.

## Repository Rules

After creating the GitHub repository, set `develop` as the default branch and protect `main` with a ruleset that:

- requires pull requests before merging
- requires the CI checks to pass
- blocks force pushes and branch deletion
- restricts direct pushes to `main`

The workflow itself also refuses to build or publish a release from any branch other than `main`.
