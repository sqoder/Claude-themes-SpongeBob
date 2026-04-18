# Claude-themes-SpongeBob

Standalone theme package for patching official Claude Code with Hippocode Pixel themes.

The npm package published from this repository is still named `claude-code-theme-patcher`.

This package is the second-stage installer:

1. it finds the official Claude Code `cli.js`
2. it backs up the original file to `~/.claude/backups/`
3. it injects Hippocode Pixel themes into the official theme registry
4. it can restore the original install later

## Install

One command, no global install:

```bash
npx claude-code-theme-patcher install spongebob
```

Reusable local command:

```bash
npm install -g claude-code-theme-patcher
```

## Usage

```bash
claude-theme-patch list
claude-theme-patch status
claude-theme-patch install spongebob
claude-theme-patch set light-patrick
claude-theme-patch remove
```

Patch an unvalidated Claude Code build anyway:

```bash
claude-theme-patch --force install spongebob
```

## Recommended user flow

Patch official Claude Code and set an initial theme:

```bash
npx claude-code-theme-patcher install spongebob
```

Switch later without reinstalling:

```bash
npx claude-code-theme-patcher set bubble-bass
```

Or install once globally, then reuse the local command:

```bash
npm install -g claude-code-theme-patcher
claude-theme-patch install spongebob
claude-theme-patch set bubble-bass
```

## Files

- Claude Code config: `~/.claude.json`
- Patch metadata: `~/.claude/hippocode-theme-patch.json`
- Backups: `~/.claude/backups/`

## Notes

- This tool modifies the official Claude Code install in place.
- It is intentionally coupled to Claude Code's current bundled `cli.js` structure.
- Version-specific patch matchers live under `src/adapters/`; add a new adapter instead of growing `src/cli.ts`.
- This release is validated against Claude Code `2.1.112`.
- When Claude Code updates, you may need to rerun the patcher or publish a new patcher build.
- Use `--target <path>` to patch a copied `cli.js` during testing instead of touching the real install.
- `status` reports whether the detected Claude Code version is inside the validated set.
- `install` blocks unvalidated Claude Code versions unless you pass `--force`.
- After patching, users can switch Hippocode Pixel themes from Claude Code `/theme` or via `claude-theme-patch set <theme>`.

## Release Check

```bash
npm run verify:release
```

## Development

```bash
npm install
npm run build
npm run smoke
```
