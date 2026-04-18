# Claude-themes-SpongeBob

Standalone theme package for patching official Claude Code with Hippocode Pixel themes.

The npm package published from this repository is still named `claude-code-theme-patcher`.

This package is the second-stage installer:

1. it finds the official Claude Code `cli.js`
2. it backs up the original file to `~/.claude/backups/`
3. it injects bundled plus imported custom themes into the official theme registry
4. it can restore the original install later

## Quick Start

Open-box path for bundled themes:

```bash
npx claude-code-theme-patcher init
```

Open-box path for your own theme pack:

```bash
npx claude-code-theme-patcher init --theme-pack ./my-themes.json
```

Reusable local command:

```bash
npm install -g claude-code-theme-patcher
```

## Usage

```bash
claude-theme-patch init [theme]
claude-theme-patch list
claude-theme-patch status
claude-theme-patch install spongebob
claude-theme-patch import-theme ./my-themes.json
claude-theme-patch sync
claude-theme-patch set light-patrick
claude-theme-patch remove
```

Patch an unvalidated Claude Code build anyway:

```bash
claude-theme-patch --force install spongebob
```

## Recommended user flow

Patch official Claude Code and set a usable bundled theme in one command:

```bash
npx claude-code-theme-patcher init
```

Patch official Claude Code and immediately use the first theme from your custom pack:

```bash
npx claude-code-theme-patcher init --theme-pack ./my-themes.json
```

Pick a specific theme during init:

```bash
npx claude-code-theme-patcher init jellyfish-fields --theme-pack ./my-themes.json
```

Switch later without reinstalling or re-importing:

```bash
npx claude-code-theme-patcher set bubble-bass
```

If you already initialized once, import an updated custom pack and refresh the patch:

```bash
npx claude-code-theme-patcher import-theme ./my-themes.json
npx claude-code-theme-patcher set jellyfish-fields
```

Or install once globally, then reuse the local command:

```bash
npm install -g claude-code-theme-patcher
claude-theme-patch init
claude-theme-patch set bubble-bass
```

## Files

- Claude Code config: `~/.claude.json`
- Patch metadata: `~/.claude/hippocode-theme-patch.json`
- Imported custom theme pack: `~/.claude/hippocode-custom-themes.json`
- Backups: `~/.claude/backups/`

## Custom Theme Pack Format

Custom themes are imported from JSON and expanded into a dark + light pair automatically.

```json
{
  "themes": [
    {
      "name": "jellyfish-fields",
      "displayName": "Jellyfish Fields",
      "accent": "#b982ff",
      "shimmer": "#e9d5ff",
      "promptBorder": "#7d5fa8"
    }
  ]
}
```

Notes:

- `name` becomes `name` and `light-name`
- colors accept `#rrggbb`, `#rgb`, or `rgb(r,g,b)`
- `displayName`, `shimmer`, and `promptBorder` are optional
- importing a theme with the same name updates the saved definition

## Notes

- This tool modifies the official Claude Code install in place.
- It is intentionally coupled to Claude Code's current bundled `cli.js` structure.
- Version-specific patch matchers live under `src/adapters/`; add a new adapter instead of growing `src/cli.ts`.
- This release is validated against Claude Code `2.1.112`.
- When Claude Code updates, you may need to rerun the patcher or publish a new patcher build.
- Use `--target <path>` to patch a copied `cli.js` during testing instead of touching the real install.
- `init` is the shortest supported user path; it patches Claude Code and sets a theme in one command.
- `status` reports whether the detected Claude Code version is inside the validated set.
- `install` blocks unvalidated Claude Code versions unless you pass `--force`.
- `import-theme` persists custom theme seeds and refreshes the current patch automatically when metadata is available.
- `sync` rebuilds the installed patch using the current saved custom theme pack.
- After patching, users can switch official, bundled, and imported custom themes from Claude Code `/theme` or via `claude-theme-patch set <theme>`.

## Release Check

```bash
npm run verify:release
```

## Publishing

This repository now includes a GitHub Actions publish workflow at `.github/workflows/publish.yml`.

Release docs:

- Current release body: `docs/releases/v0.2.1.md`
- Next automated release checklist: `docs/releases/0.2.2-checklist.md`
- Project changelog: `CHANGELOG.md`

One-time npm setup:

1. Create or claim the `claude-code-theme-patcher` package on npm.
2. In npm package settings, add a trusted publisher for:
   - GitHub user or org: `sqoder`
   - Repository: `Claude-themes-SpongeBob`
   - Workflow filename: `publish.yml`
3. After the first successful publish, restrict package publishing to trusted publishing on npm.

Release flow:

1. Bump `package.json` to the version you want to ship.
2. Push that commit to `main`.
3. Create a GitHub Release with tag `v<package.json version>`.
4. The publish workflow will run `npm run verify:release` and then `npm publish`.

Notes:

- The workflow uses npm trusted publishing through GitHub Actions OIDC.
- `package.json` already points `repository.url` at `https://github.com/sqoder/Claude-themes-SpongeBob.git`, which npm requires to match the publishing repository for trusted publishing.
- npm package name lookup returned `404 Not Found` on `2026-04-18`, so `claude-code-theme-patcher` did not appear to be published at that time.

## Development

```bash
npm install
npm run build
npm run smoke
```
