# SignPath Open Source Setup

This repository is prepared for a GitHub Actions based SignPath signing flow.

## 1. Repository prerequisites

- Keep the repository public.
- Use GitHub-hosted runners for the signing workflow.
- Add an OSI-approved open-source license before submitting to the SignPath Open Source program.
- Install the SignPath GitHub App and grant it access to `nchiappetta83/studiosync`.

Official references:

- [SignPath GitHub trusted build system docs](https://docs.signpath.io/trusted-build-systems/github)
- [SignPath artifact configuration docs](https://docs.signpath.io/artifact-configuration/)

## 2. SignPath project setup

In SignPath:

1. Add the predefined trusted build system `GitHub.com` to your organization.
2. Create or choose a project for this repo.
3. Link the GitHub repository to that SignPath project.
4. Create a signing policy for releases.
5. Create two artifact configurations, one for each installer.

SignPath's GitHub integration expects workflow artifacts to arrive as ZIP archives, so the root element of each artifact configuration must be `<zip-file>`.

### Suggested SignPath slugs

- Project slug: `studiosync`
- Signing policy slug: `release-signing`
- StudioSync artifact configuration slug: `studiosync-installer`
- StudioSync MyTasks artifact configuration slug: `studiosync-mytasks-installer`

## 3. Example artifact configurations

### StudioSync installer

```xml
<?xml version="1.0" encoding="utf-8" ?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="StudioSync Setup *.exe">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

### StudioSync MyTasks installer

```xml
<?xml version="1.0" encoding="utf-8" ?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="StudioSync MyTasks Setup *.exe">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

## 4. GitHub repository configuration

Add these repository variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_STUDIOSYNC_ARTIFACT_CONFIG_SLUG`
- `SIGNPATH_MYTASKS_ARTIFACT_CONFIG_SLUG`

Add this repository secret:

- `SIGNPATH_API_TOKEN`

The API token should belong to a SignPath user with submitter permissions for the chosen project and signing policy.

## 5. Release flow

The workflow file is [`.github/workflows/release-signpath.yml`](../.github/workflows/release-signpath.yml).

It:

1. builds both Electron installers on `windows-latest`
2. uploads the unsigned installers as GitHub Actions artifacts
3. submits both workflow artifacts to SignPath
4. downloads the signed installers back into the workflow
5. uploads the signed installers to the GitHub release for tags like `v1.0.2`

To publish a signed release:

```powershell
git tag v1.0.2
git push origin v1.0.2
```

You can also run the workflow manually with `workflow_dispatch` to test the SignPath connection before tagging a release.
