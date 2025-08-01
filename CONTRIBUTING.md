# Contributing Guide

We'd love your help!

- [Development Quick Start](#development-quick-start)
- [Report a bug or requesting feature](#report-a-bug-or-requesting-feature)
- [How to contribute](#how-to-contribute)
  - [Before you start](#before-you-start)
    - [Conventional commit](#conventional-commit)
  - [Fork](#fork)
- [Development](#development)
  - [Tools used](#tools-used)
  - [General guidance](#general-guidance)
  - [CHANGELOG](#changelog)
  - [Benchmarks](#benchmarks)
- [Component Ownership](#component-ownership)
  - [Becoming a Component Owner](#becoming-a-component-owner)
- [Component Lifecycle](#component-lifecycle)
  - [Unreleased](#unreleased)
  - [Experimental](#experimental)
  - [Beta](#beta)
  - [Stable](#stable)
  - [Unmaintained](#unmaintained)
  - [Deprecated](#deprecated)
- [Pull Request Merge Guidelines](#pull-request-merge-guidelines)
  - [General Merge Requirements](#general-merge-requirements)
- [Contributing Vendor Components](#contributing-vendor-components)
  - [Adding a New Vendor Component](#adding-a-new-vendor-component)
  - [Removing Vendor Components](#removing-vendor-components)
- [New Instrumentation](#new-instrumentation)

## Development Quick Start

To get the project started quickly, you can follow these steps. For more
detailed instructions, see [development](#development) below.

```sh
git clone https://github.com/open-telemetry/opentelemetry-js-contrib.git
cd opentelemetry-js-contrib
npm ci
npm run compile
npm test
```

## Report a bug or requesting feature

Reporting bugs is an important contribution. Please make sure to include:

- expected and actual behavior.
- Node version that application is running.
- OpenTelemetry version that application is using.
- if possible - repro application and steps to reproduce.

## How to contribute

### Before you start

Please read project contribution
[guide](https://github.com/open-telemetry/community/blob/main/guides/contributor)
for general practices for OpenTelemetry project.

#### Conventional commit

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history; which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages. You can see examples [here](https://www.conventionalcommits.org/en/v1.0.0/#examples).

We use [the "pr-title" CI workflow](./.github/workflows/pr-title.yml) to ensure PR titles, and hence the commit message from those PRs, follow the Conventional Commits spec.

### Fork

In the interest of keeping this repository clean and manageable, you should work from a fork. To create a fork, click the 'Fork' button at the top of the repository, then clone the fork locally using `git clone git@github.com:USERNAME/opentelemetry-js-contrib.git`.

You should also add this repository as an "upstream" repo to your local copy, in order to keep it up to date. You can add this as a remote like so:

```bash
git remote add upstream https://github.com/open-telemetry/opentelemetry-js-contrib.git

#verify that the upstream exists
git remote -v
```

To update your fork, fetch the upstream repo's branches and commits, then merge your main with upstream's main:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

Remember to always work in a branch of your local copy, as you might otherwise have to contend with conflicts in main.

Please also see [GitHub workflow](https://github.com/open-telemetry/community/blob/main/guides/contributor/processes.md#github-workflow) section of general project contributing guide.

## Development

### Tools used

- [NPM](https://npmjs.com)
- [TypeScript](https://www.typescriptlang.org/)
- [lerna](https://github.com/lerna/lerna) to manage dependencies, compilations, and links between packages. Most lerna commands should be run by calling the provided npm scripts.
- [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [MochaJS](https://mochajs.org/) for tests
- [eslint](https://eslint.org/)

Refer to the core repository for [supported runtimes](https://github.com/open-telemetry/opentelemetry-js#supported-runtimes).
Refer to the root-level [package.json](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/package.json) for shared dev dependency versions, and the package-level package.json for package-specific versions if different or not included in the shared root.

### General guidance

The `opentelemetry-js-contrib` project is written in TypeScript.

As a general rule, installing from the root directory should always be done first before anything else.
Packages within this repository might have dependencies between them. This means the dependencies should
be built before if you want to `compile` or `test` the changes you've made in a package. Each package
has a script to ensure these dependecies are ready.

The required steps to start development on a pacakge are:

- `npm ci` from root folder to install dependencies ([see npm-ci docs](https://docs.npmjs.com/cli/v10/commands/npm-ci))
- `cd` into the pacakge you want to apply changes.
- `npm run compile:with-dependencies` compiles the TypeScript files for this package and its dependencies within the repository.

Then you can proceed to do apply the changes and use the scripts below for development workflow

- `npm run compile` compiles the code, checking for type errors.
- `npm test` runs most unit tests, though some packages require other dependencies so are only run in CI or with a separate command in the package's `package.json` file.
- `npm run lint:fix` lint any changes and fix if needed.

### CHANGELOG

The conventional commit type (in PR title) is very important to automatically bump versions on release. For instance:

- any type + `!` will bump major version (or minor on pre-release)
- `feat` will bump minor
- `fix` will bump patch

There is no need to update the CHANGELOG in a PR because it will be updated as part of the release process (see [RELEASING.md](RELEASING.md) for more details).

### Testing

Most unit tests case be run via:

```sh
npm test
```

However, some instrumentations require test-services to be running (e.g. the `instrumentation-mongodb` package requires a MongoDB server). Use the `test-services`-related npm scripts to start all required services in Docker and then run the tests with the appropriate configuration to use those services:

```sh
npm run test-services:start    # starts services in Docker
npm run test:with-services-env # runs 'npm test' with envvars from test/test-services.env
npm run test-services:stop     # stops services in Docker
```

If you only want to test a single package that dfepends on a service (e.g. the `instrumentation-mongodb`) you can `cd` into it and
use the same scripts for testing. In this case the script will only start the services needed to test the package.

```sh
cd packages/instrumentation-mongodb # get into the instrumenation folder
npm run test-services:start         # start the MongoDB service in Docker
npm run test:with-services-env      # runs 'npm test' with envvars from test/test-services.env
npm run test-services:stop          # stop MongoDB service in Docker
```

### Benchmarks

When two or more approaches must be compared, please write a benchmark in the benchmark/index.js module so that we can keep track of the most efficient algorithm.

- `npm run bench` to run your benchmark.

## Component Ownership

This repository contains many components which are maintained by more than the typical set of JS maintainers and approvers.
Each component in this repository SHOULD have a component owner who is responsible for maintaining it.
The README.md for each component SHOULD contain its owner, but the source of truth for component ownership is in [.github/component_owners.yml](.github/component_owners.yml).

Component owners are generally given authority to make decisions relating to implementation and feature requests for their components,
provided they follow the best practices set out by the maintainers and the [mission, vision and values](https://github.com/open-telemetry/community/blob/main/mission-vision-values.md)
of the OpenTelemetry Project. To facilitate independent triage of issues pertaining to the owned component, component owners are assigned
[the Triager role](https://github.com/open-telemetry/community/blob/main/guides/contributor/membership.md#triager).

Component owners MUST do their best to maintain a high level of quality, security, performance, and specification compliance within their components.
Maintainers may override the decisions of component owners, but should only do so when they feel one or more of these traits is compromised.

### Becoming a Component Owner

To become a component owner, contributors MUST be a [member](https://github.com/open-telemetry/community/blob/main/guides/contributor/membership.md#member) of the OpenTelemetry GitHub organization.
To become a member, follow the steps in the [community guidelines for membership requirements](https://github.com/open-telemetry/community/blob/main/guides/contributor/membership.md#requirements).

To become a component owner, contributors SHOULD demonstrate prior knowledge of the instrumented package or the concepts therein.

Ways do to so may be by providing proof of:

- current or prior involvement with the community that develops the upstream package
  - **Example:** A person working on MongoDB requesting ownership over a MongoDB instrumentation
- current or prior involvement with a community that develops systems with similar concepts
  - **Example:** A person previously working on a MySQL requesting ownership of a instrumentation package that instruments another database client library instrumentation.
- current or prior extensive use of the instrumented package in other project they are involved in
  - **Example:** A person working at a company that makes extensive use of the `fastify` library requesting ownership of the `@opentelemetry/instrumentation-fastify` package.
- a vested interest in the telemetry being emitted from that instrumentation
  - **Example:** A person employed at an observability vendor that relies on the continued maintenance of the instrumentation

**Examples of proof may include but are not limited to:**

- Links to issues/PRs they worked on
- Links to blog posts authored by them on behalf of the organization developing that system
- Membership in GitHub teams/organizations that are associated with the development of the upstream package

Aspiring Component Owners MUST agree to uphold the [mission, vision and values](https://github.com/open-telemetry/community/blob/main/mission-vision-values.md) of the OpenTelemetry project.
Further, aspiring component owners are expected to have knowledge of the [OpenTelemetry Semantic Conventions](https://github.com/open-telemetry/semantic-conventions)
and MUST agree to adhere to the rules set out therein.

If all these conditions are met, aspiring component owners are encouraged to self-nominate by opening an issue.
@open-telemetry/javascript-maintainers will then engage on the issue, may ask questions, and will then - based on the
information provided on the issue - either approve or deny the ownership request. If the ownership request has been
approved, the new component owner opens a PR to add themselves to the list of owners ([.github/component_owners.yml](.github/component_owners.yml))
for that package.
@open-telemetry/javascript-maintainers will add the component owner to @open-telemetry/javascript-contrib-triagers.

## Component Lifecycle

This repository contains many components in various stages of the component lifecycle.
A component may be **unreleased**, **experimental**, **beta**, **stable**, **unmaintained**, or **deprecated**; see the below definitions for each stability level.
With the exception of the stable status, it is up to each individual [component owner](#component-ownership) to determine the status of a component.
A component may only be marked stable with the approval of a member of @open-telemetry/javascript-maintainers; see the definition of stable below for more details.

A Pull Request modifying components in any stage of the lifecycle is subject to the
[Pull Request Merge Guidelines](#pull-request-merge-guidelines).

### Unreleased

Unreleased components are in active development and have not yet been released to NPM.
Unreleased packages should have the property `private` in their `package.json` set to `true`.

### Experimental

Experimental packages are in active development.
They should be considered unstable and potentially unsuitable for production use.
They are released to NPM for developers and early adopters.
Experimental components MUST have their major version set to `0`.
If a component does not have an explicit status in its README.md file, it should be considered to be experimental.

### Beta

Beta packages are not yet considered stable, but an effort should be made to preserve stability across versions if possible.
They may be ready for production use, but users should understand that their APIs or the telemetry they output MAY change if required.
Beta components MUST have their major version set to `0`.

### Stable

This is the highest level of quality and maintainership guarantee provided in this repository.
Stable packages should be considered stable and ready for production use.
In order for a package to be marked stable, it must meet the following requirements:

- It MUST have a component owner that the JS maintainers feel confident will be responsive to issues and pull requests and will fulfill their responsibility competently.
  If a component owner is not responsive to issues and PRs, the maintainers may assign a new owner or change the status of the component to unmaintained.
- All relevant specification relating to the component MUST be stable. For example, telemetry emitted by an instrumentation library should rely on a stable semantic convention.
- It MUST be reviewed and approved by a member of @open-telemetry/javascript-maintainers.

Stable components MUST have their major version set to `1` or greater.

### Unmaintained

A component which does not have an assigned component owner, or has a component owner who has been unresponsive to issues
and pull requests may be marked as `pkg-status:unmaintained`.

Unmaintained components may continue to work and receive updates and fixes from contributors. An unmaintained component
is considered feature-freeze and new feature-requests may be closed within two weeks if no new owner is found.
[@open-telemetry/javascript-approvers](https://github.com/orgs/open-telemetry/teams/javascript-approvers) may sponsor
features for unmaintained components. At least one sponsor is needed to lift the feature-freeze for the purpose of
adding the requested feature. Sponsors are expected to provide reviews for that feature and be responsive on the issue.

Components marked as unmaintained still receive semantic conventions updates and bugfixes where possible.
[@open-telemetry/javascript-contrib-triagers](https://github.com/orgs/open-telemetry/teams/javascript-contrib-triagers) may add the
`type:semconv-update` or `bug` label to mark them as exempt from being auto-closed within two weeks.

A component which is unmaintained may be deprecated if there is a problem that is not fixed in a timely manner.

### Deprecated

Deprecated components are no longer maintained and there are not currently plans to maintain them.
They may not work and there are no guarantees for fixes or new features.
Their source files may be deleted from the repository.
Any packages released from their source will be marked as deprecated in NPM.

## Pull Request Merge Guidelines

Pull requests MAY be merged by an approver OR a maintainer provided they meet all the following [General Merge Requirements](#general-merge-requirements).
All requirements are at the discretion of the maintainers.
Maintainers MAY merge pull requests which have not strictly met these requirements.
Maintainers MAY close, block, or put on hold pull requests even if they have strictly met these requirements.

It is generally expected that a maintainer ([@open-telemetry/javascript-maintainers](https://github.com/orgs/open-telemetry/teams/javascript-maintainers)) should review and merge major changes.
Some examples include, but are not limited to:

- Breaking changes
- New modules
- Changes which affect runtime support

If a PR has not been interacted with by a reviewer within one week, please ping the component
owners as listed in [.github/component_owners.yml](.github/component_owners.yml), if component owners are unresponsive
please ping ([@open-telemetry/javascript-approvers](https://github.com/orgs/open-telemetry/teams/javascript-approvers)).

### General Merge Requirements

- Approved by
  - at least one component owner if one is defined in [.github/component_owners.yml](.github/component_owners.yml)
    - upon approval, the component owner SHOULD apply the `has:owner-approval` label to signal to maintainers that the PR is ready to merge.
  - OR one maintainer
  - OR at least one approver who is not the approver merging the pull request
    - A pull request for small (simple typo, URL, update docs, or grammatical fix) changes may be approved and merged by the same approver
- No “changes requested” reviews or unresolved conversations by
  - approvers
  - maintainers
  - technical committee members
  - component owners
  - subject-matter experts
- New or changed functionality is tested by unit tests
- New or changed functionality is documented if appropriate
- Substantial changes should not be merged within 24 hours of opening in order to allow reviewers from all time zones to have a chance to review

## New Instrumentation

**Do not submit pull requests for new instrumentation without reading the following.**

This project is dedicated to promoting the development of quality instrumentation using OpenTelemetry.
To achieve this goal, we recognize that the instrumentation needs to be written using the best practices of OpenTelemetry, but also by developers that understand the package they are instrumenting.
Additionally, the produced instrumentation needs to be maintained and evolved.

The size of the OpenTelemetry JavaScript developer community is not large enough to support an ever-growing amount of instrumentation.
Therefore, to reach our goal, we have the following recommendations for where instrumentation packages should live.

1. Native to the instrumented package
2. Close to where maintenance of the instrumented library takes place. For example:
   1. in a repository that is part of the organization that maintains the instrumented library
   2. in the same repository as the instrumented library
3. A dedicated public repository
4. Here in the opentelemetry-js-contrib repository

If possible, OpenTelemetry instrumentation should be included in the instrumented package.
This will ensure the instrumentation reaches all package users, and is continuously maintained by developers that understand the package.

If instrumentation cannot be directly included in the package it is instrumenting, it should be hosted in a dedicated public repository owned by its maintainer(s).
This will appropriately assign maintenance responsibilities for the instrumentation and ensure these maintainers have the needed privilege to maintain the code.

The last place instrumentation should be hosted is here in this repository.
Maintaining instrumentation here hampers the development of OpenTelemetry for JavaScript and therefore should be avoided.
When instrumentation cannot be included in a target package and there is good reason to not host it in a separate and dedicated repository an [instrumentation request](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/new/choose) should be filed.
Note that new instrumentation needs at least two contributors assigned to it as code-owners.  It is the responsibility
of the requesting party to reach out and find code-owners for the proposed instrumentation. The instrumentation request
needs to be accepted before any pull requests for the instrumentation can be considered for merging.
Review the guidelines for [Becoming a Component Owner](#becoming-a-component-owner).

Regardless of where instrumentation is hosted, it needs to be discoverable.
The [OpenTelemetry registry](https://opentelemetry.io/registry/) exists to ensure that instrumentation is discoverable.
You can find out how to add instrumentation to the registry [here](https://github.com/open-telemetry/opentelemetry.io#adding-a-project-to-the-opentelemetry-registry).

## Contributing Vendor Components

This repo is generally meant for hosting components that work with popular open-source frameworks and tools. However, it is also possible to contribute components specific to a 3rd party vendor in this repo.

### Adding a New Vendor Component

Vendor components that are hosted in this repo will be versioned the same as all other contrib components, and released in lockstep with them under the `@opentelemetry` org in npm.

In exchange, vendor component contributors are expected to:

- Include documentation for the component that covers:
  - The installation and getting started process for the component
  - Any configuration for the component
  - Any APIs exposed by the component
  - Design information for the component if relevant
- Add enough unit tests to *at least* meet the current coverage
- Assign at least one full-time engineer to their component in the [CODEOWNERS](.github/CODEOWNERS) file
- Review pull requests that touch their component
- Respond to issues related to their component, as determined by the maintainers
- Fix failing unit tests or any other blockers to the CI/CD workflow
- Update their components' usage of Core APIs upon the introduction of breaking changes upstream

### Removing Vendor Components

All vendor components are subject to removal from the repo at the sole discretion of the maintainers. Reasons for removal include but are not limited to failing to adhere to any of the expectations defined above in a timely manner. "Timely manner" can vary depending on the urgency of the task, for example if a flaky unit test is blocking a release for the entire repo that would be far more urgent than responding to a question about usage. As a rule of thumb, 2-3 business days is a good goal for non-urgent response times.
