# Claude-themes-SpongeBob

Standalone theme package for patching official Claude Code with Hippocode Pixel themes.

The npm package published from this repository is still named `claude-code-theme-patcher`.

This package is the second-stage installer:

1. it finds the official Claude Code `cli.js`
2. it backs up the original file to `~/.claude/backups/`
3. it injects bundled plus imported custom themes into the official theme registry
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

Patch official Claude Code and set an initial theme:

```bash
npx claude-code-theme-patcher install spongebob
```

Switch later without reinstalling:

```bash
npx claude-code-theme-patcher set bubble-bass
```

Import your own theme pack, re-embed it into Claude Code, then switch to it:

```bash
npx claude-code-theme-patcher import-theme ./my-themes.json
npx claude-code-theme-patcher set jellyfish-fields
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
- `status` reports whether the detected Claude Code version is inside the validated set.
- `install` blocks unvalidated Claude Code versions unless you pass `--force`.
- `import-theme` persists custom theme seeds and refreshes the current patch automatically when metadata is available.
- `sync` rebuilds the installed patch using the current saved custom theme pack.
- After patching, users can switch official, bundled, and imported custom themes from Claude Code `/theme` or via `claude-theme-patch set <theme>`.

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
