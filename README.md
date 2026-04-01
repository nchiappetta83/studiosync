# StudioSync

StudioSync is a Windows Electron monorepo containing:

- `sd-scheduling`: the main StudioSync dashboard app
- `sd-companion`: the StudioSync MyTasks companion app

## Local development

Build the dashboard:

```powershell
cd sd-scheduling
npm ci
npm run build
```

Build MyTasks:

```powershell
cd sd-companion
npm ci
npm run build
```

## Signed releases

GitHub Actions is configured in [`.github/workflows/release-signpath.yml`](.github/workflows/release-signpath.yml) to:

1. build both Windows installers on GitHub-hosted runners
2. upload the unsigned installers as GitHub workflow artifacts
3. submit both artifacts to SignPath for signing
4. upload the signed installers to the GitHub release for version tags

Push a tag like `v1.0.2` to trigger a signed release.

## SignPath setup

Setup details are documented in [`docs/signpath-setup.md`](docs/signpath-setup.md).

Before applying for SignPath Open Source, add an OSI-approved open-source license to the repo and update the package license fields accordingly.
