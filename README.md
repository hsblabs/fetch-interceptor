# @your-scope/your-package

`@your-scope/your-package` is a boilerplate repository for building and publishing TypeScript libraries to npm.

It includes a strict TypeScript setup, `tsdown` for bundling, Vitest for unit tests, Biome for linting and formatting, and GitHub Actions workflows for CI and tagged publishes.

The exported functions in `src/index.ts` are sample code. Replace them with your library API after you clone the template.

The package name in this repository is intentionally a placeholder. This repository is the template, not the final library.

## Included Tooling

- TypeScript with strict compiler settings
- `tsdown` for ESM builds and `.d.ts` generation
- Vitest for unit tests
- Biome for linting and formatting
- GitHub Actions for CI and npm publish
- `prepublishOnly` checks to block broken releases

## Quick Start

```sh
pnpm install
pnpm test
pnpm build
```

To turn this repository into a real package, update these fields first:

- package name, description, keywords, repository URLs in `package.json`
- README package name and usage examples
- LICENSE copyright owner if needed
- sample exports in `src/index.ts`
- release details in `.changeset/config.json` if your repository conventions differ

## Development Commands

```sh
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm check
pnpm changeset
pnpm version-packages
pnpm release
```

## Sample API

The current sample API demonstrates a few pure utilities that are easy to test and replace.

```ts
import { chunk, clamp, uniqueBy } from "@your-scope/your-package";

const bounded = clamp(14, { min: 0, max: 10 });
const groups = chunk([1, 2, 3, 4, 5], 2);
const deduped = uniqueBy(
  [
    { id: "a", group: "x" },
    { id: "b", group: "x" },
    { id: "c", group: "y" },
  ],
  (item) => item.group,
);

console.log({ bounded, groups, deduped });
```

## Release Flow

This boilerplate uses Changesets for versioning and release PR management.

1. Add a release note with `pnpm changeset`.
2. Merge the feature PR into `main`.
3. The `publish.yml` workflow opens or updates a release PR.
4. Review and merge the release PR.
5. The same `publish.yml` workflow publishes the package from `main`.

## Trusted Publishing Bootstrap

Because npm lets you attach a Trusted Publisher only after a package exists, there is still a one-time bootstrap step.

Recommended operation:

1. Publish the package once from your local machine.
2. Open the package settings on npmjs.com and add a Trusted Publisher.
3. Set the GitHub repository and the workflow filename to `publish.yml`.
4. Leave the environment name empty unless you intentionally protect the workflow with a GitHub Environment.
5. Verify that the next publish works through GitHub Actions.
6. After verification, disallow token-based publishing in npm package settings and revoke old publish tokens.

After bootstrap, later publishes should come from GitHub Actions with OIDC only.

## Trusted Publisher Notes

- Trusted publishing works only on GitHub-hosted runners.
- The publish workflow must keep `id-token: write`.
- For public packages from public repositories, npm generates provenance automatically when trusted publishing is used.
- If CI needs private npm dependencies, use a read-only npm token only for install steps, not for `npm publish`.

## Project Structure

```text
src/
	index.ts
	index.test.ts
.github/workflows/
	ci.yml
	publish.yml
.changeset/
docs/plans/
```

## Notes

- The package is ESM-first.
- Build artifacts are emitted to `dist/`.
- Only `dist/`, `README.md`, `CHANGELOG.md`, and `LICENSE` are published.
