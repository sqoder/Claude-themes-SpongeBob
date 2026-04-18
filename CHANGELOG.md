# Changelog

All notable changes to this project will be documented in this file.

## 0.2.2 - 2026-04-18

### Added

- Added an open-box install path for newer Claude Code npm-wrapper installs that ship a native `bin/claude.exe`.
- Added a managed validated Claude Code runtime cache under `~/.claude/hippocode-managed-runtime/`.
- Added smoke coverage for native-wrapper `init`, `status`, launcher execution, and `remove`.

### Changed

- `init` now chooses between direct `cli.js` patching and a managed launcher strategy based on the detected Claude Code install shape.
- Target discovery now prefers the official `@anthropic-ai/claude-code` npm install when local shell wrappers shadow `claude` on `PATH`.
- `remove` now restores the official launcher and deletes the managed runtime cache for managed-launcher installs.

## 0.2.1 - 2026-04-18

### Added

- Added `init` as the shortest supported user flow for patching Claude Code and selecting a usable theme in one command.
- Added custom theme pack import, persistence, sync, and switching support.
- Added release publishing automation with GitHub Actions and npm trusted publishing documentation.
- Published the package to npm as `claude-code-theme-patcher`.

### Changed

- Refactored Claude Code patching into version adapters and smaller matcher modules for `2.1.112`.
- Updated README usage and publishing instructions to match the shipped CLI.

## 0.1.0 - 2026-04-18

### Added

- Initial standalone Claude Code theme patcher release with bundled SpongeBob themes.
