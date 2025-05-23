# Releasing OpenTelemetry Packages (for Maintainers Only)

This repository uses [Release Please](https://github.com/googleapis/release-please) to manage its releases automatically and independently.
Modified packages are automatically published to npm when the auto-generated Release Please PR is merged.

## Manual Publishing Process

For posterity, or in the event of any failures with release-please, the process for performing a manual release is below.

Manual Release Process Steps:

- [Update to latest locally](#update-to-latest-locally)
- [Create a new branch](#create-a-new-branch)
- [Prepare each package for release](#prepare-each-package-for-release)
- [Use the Changelog to create a GitHub Release](#use-the-changelog-to-create-a-github-release)
- [Create a new PR](#create-a-new-pr)
- [Merge and pull](#merge-and-pull)
- [Publish all packages](#publish-all-packages)
- [Publish the GitHub Release](#publish-the-github-release)
- [Update CHANGELOG](#update-changelog)

## Update to latest locally

Use `git fetch` and `git checkout origin/main` to ensure you’re on the latest commit. Make sure you have no unstaged changes. Ideally, also use `git clean -dfx` to remove all ignored and untracked files.

## Create a new branch

Create a new branch called `x.y.z-proposal` from the current commit.

## Prepare each package for release

Decide on the next `major.minor.patch` release number based on [semver](http://semver.org/) guidelines.

- Use `npm install` command to initialize all package directories
- Use `lerna publish --skip-npm --no-git-tag-version --no-push` to bump the version in all `package.json`

## Use the Changelog to create a GitHub Release

### Generate the changelog with lerna

Since we use `lerna`, we can use [lerna-changelog](https://github.com/lerna/lerna-changelog#lerna-changelog)

#### How to use

Pass your [github token](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line) to generate the changelog automatically.
For security reasons, when you create a Github token, select the permissions: under **repo**, select **Access public repositories**, **commit status**.

In your terminal, execute the following command:

```bash
GITHUB_AUTH=<your token> lerna-changelog
```

It will print something like:

```md
## Unreleased (2018-05-24)

#### :bug: Bug Fix
- [#198](https://github.com/my-org/my-repo/pull/198) Avoid an infinite loop ([@helpful-hacker](https://github.com/helpful-hacker))

#### :house: Internal
- [#183](https://github.com/my-org/my-repo/pull/183) Standardize error messages ([@careful-coder](https://github.com/careful-coder))

#### Commiters: 2
- Helpful Hacker ([@helpful-hacker](https://github.com/helpful-hacker))
- [@careful-coder](https://github.com/careful-coder)
```

By default lerna-changelog will show all pull requests that have been merged since the latest tagged commit in the repository. That is however only true for pull requests **with certain labels applied** (see [lerna.json](lerna.json) for authorized labels).

You can also use the `--from` and `--to` options to view a different range of pull requests:

```text
GITHUB_AUTH=xxxxx lerna-changelog --from=v1.0.0 --to=v2.0.0
```

#### Update Changelog file

From what `lerna-changelog` has generated, starts new Unreleased label. Follow the example set by recent Released label.

On [GitHub Releases](https://github.com/open-telemetry/opentelemetry-js/releases), follow the example set by recent releases to populate a summary of changes, as well as a list of commits that were applied since the last release. Save it as a draft, don’t publish it. Don’t forget the tag -- call it `vx.y.z` and leave it pointing at `main` for now (this can be changed as long as the GitHub release isn’t published).

## Create a new PR

Create a pull request titled `chore: x.y.z release proposal`. The commit body should just be a link to the draft notes. Someone who can access draft notes should approve it, looking in particular for test passing, and whether the draft notes are satisfactory.

## Merge and pull

Merge the PR, and pull the changes locally (using the commands in the first step). Ensure that `chore: x.y.z release proposal` is the most recent commit.

## Compile all packages

Go into the root folder and run `npm ci && npm run compile` to build all packages with the latest version of the code.

## Publish all packages

Use lerna's `publish` command to walk over all non private packages and publish the ones that has not been published yet.

```sh
npx lerna publish from-package --no-push --no-private --no-git-tag-version --no-verify-access --yes
```

Check your e-mail and make sure the number of “you’ve published this module” emails matches the number you expect.

## Publish the GitHub Release

Publish the GitHub release, ensuring that the tag points to the newly landed commit corresponding to release proposal `x.y.z`.

## Update CHANGELOG

- After releasing is done, update the [CHANGELOG.md](https://github.com/open-telemetry/opentelemetry-js/blob/main/CHANGELOG.md) and start new Unreleased label.
- Create a new commit with the exact title: `Post Release: update CHANGELOG.md`.
- Go through PR review and merge it to GitHub main branch.

## Known Issues

- The `examples/` and `getting-started/` folders are not part of lerna packages, we need to manually bump the version in `package.json`.
