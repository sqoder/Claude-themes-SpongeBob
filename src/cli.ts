#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import {
  BASE_PIXEL_THEME_SEEDS,
  PIXEL_THEME_NAMES,
  isPixelThemeName,
} from './themeFactory.js'
import {
  applyClaudeCodePatch,
  getValidatedVersionSummary,
  isValidatedClaudeCodeVersion,
  resolveClaudeCodeAdapter,
} from './claudeCodeAdapter.js'
import {
  PATCHER_VERSION,
  PATCH_MARKER,
  hasCurrentPatchFeatures,
} from './patchRuntime.js'

const OFFICIAL_THEMES = [
  'dark',
  'light',
  'light-daltonized',
  'dark-daltonized',
  'light-ansi',
  'dark-ansi',
] as const

type OfficialTheme = (typeof OFFICIAL_THEMES)[number]

type SupportedTheme = OfficialTheme | (typeof PIXEL_THEME_NAMES)[number]

type ClaudeConfig = {
  theme?: string | null
  [key: string]: unknown
}

type PatchMetadata = {
  version: string
  targetPath: string
  backupPath: string
  installedAt: string
  claudeVersion: string | null
  sha256: string
}

type CliOptions = {
  targetPath?: string
  force: boolean
  args: string[]
}

function printUsage(): void {
  console.log(`claude-theme-patch

Usage:
  claude-theme-patch list
  claude-theme-patch status
  claude-theme-patch install [theme]
  claude-theme-patch set <theme>
  claude-theme-patch remove
  claude-theme-patch paths

Options:
  --target <path>   Patch a specific Claude Code cli.js file
  --force           Patch an unvalidated Claude Code version anyway

Notes:
  - install backs up the original Claude Code cli.js before patching
  - set writes ~/.claude.json and accepts official plus Hippocode Pixel themes
  - remove restores the backup recorded in ~/.claude/hippocode-theme-patch.json`)
}

function parseCliOptions(argv: string[]): CliOptions {
  const args: string[] = []
  let targetPath: string | undefined
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (value === '--target') {
      targetPath = argv[index + 1]
      if (!targetPath) {
        throw new Error('Missing path after --target')
      }
      index += 1
      continue
    }

    if (value.startsWith('--target=')) {
      targetPath = value.slice('--target='.length)
      if (!targetPath) {
        throw new Error('Missing path after --target=')
      }
      continue
    }

    if (value === '--force') {
      force = true
      continue
    }

    args.push(value)
  }

  return { targetPath, force, args }
}

function getClaudeConfigPath(): string {
  return join(homedir(), '.claude.json')
}

function getClaudeBackupDir(): string {
  return join(homedir(), '.claude', 'backups')
}

function getPatchMetadataPath(): string {
  return join(homedir(), '.claude', 'hippocode-theme-patch.json')
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }

  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON object: ${path}`)
  }

  return parsed as T
}

function readConfig(): ClaudeConfig {
  return readJsonFile<ClaudeConfig>(getClaudeConfigPath()) ?? {}
}

function writeConfig(config: ClaudeConfig): void {
  const path = getClaudeConfigPath()
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function backupConfig(): string | null {
  const source = getClaudeConfigPath()
  if (!existsSync(source)) {
    return null
  }

  const backupPath = join(
    getClaudeBackupDir(),
    `.claude.json.theme-backup.${Date.now()}.json`,
  )
  ensureParentDir(backupPath)
  copyFileSync(source, backupPath)
  return backupPath
}

function readPatchMetadata(): PatchMetadata | null {
  return readJsonFile<PatchMetadata>(getPatchMetadataPath())
}

function writePatchMetadata(metadata: PatchMetadata): void {
  const path = getPatchMetadataPath()
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}

function deletePatchMetadata(): void {
  const path = getPatchMetadataPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

function getClaudeBinaryPath(): string | null {
  try {
    const path = execFileSync('which', ['claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return path === '' ? null : path
  } catch {
    return null
  }
}

function resolveClaudeTargetPath(targetPath?: string): string {
  const input = targetPath ?? getClaudeBinaryPath()
  if (!input) {
    throw new Error(
      'Claude Code was not found in PATH. Pass --target <path> to patch a specific cli.js file.',
    )
  }

  const resolvedPath = realpathSync(resolve(input))
  if (!existsSync(resolvedPath)) {
    throw new Error(`Claude Code target does not exist: ${resolvedPath}`)
  }

  return resolvedPath
}

function readTargetSource(targetPath: string): string {
  return readFileSync(targetPath, 'utf8')
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function getClaudeVersionForTarget(targetPath: string): string | null {
  try {
    return execFileSync('node', [targetPath, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function parseClaudeVersion(versionOutput: string | null): string | null {
  if (!versionOutput) {
    return null
  }

  const match = versionOutput.match(/\b\d+\.\d+\.\d+\b/)
  return match?.[0] ?? null
}

function isValidatedClaudeVersion(versionOutput: string | null): boolean {
  return isValidatedClaudeCodeVersion(parseClaudeVersion(versionOutput))
}

function assertValidatedClaudeVersion(
  targetPath: string,
  force: boolean,
): string | null {
  const versionOutput = getClaudeVersionForTarget(targetPath)
  if (isValidatedClaudeVersion(versionOutput)) {
    return versionOutput
  }

  const versionLabel = versionOutput ?? 'unknown'
  const message =
    `Claude Code ${versionLabel} has not been validated with claude-code-theme-patcher ${PATCHER_VERSION}. ` +
    `Validated versions: ${getValidatedVersionSummary()}.`

  if (!force) {
    throw new Error(`${message} Re-run with --force to patch anyway.`)
  }

  console.warn(`${message} Proceeding because --force was provided.`)
  return versionOutput
}

function isPatchedSource(source: string): boolean {
  return source.includes(PATCH_MARKER)
}

function patchClaudeSource(
  source: string,
  installedAt: string,
  versionOutput: string | null,
  force: boolean,
): string {
  const adapter = resolveClaudeCodeAdapter(
    parseClaudeVersion(versionOutput),
    force,
  )
  return applyClaudeCodePatch(source, adapter, { installedAt })
}

function backupTargetFile(targetPath: string): string {
  const backupPath = join(
    getClaudeBackupDir(),
    `${basename(targetPath)}.hippocode-theme-patch.${Date.now()}.bak`,
  )
  ensureParentDir(backupPath)
  copyFileSync(targetPath, backupPath)
  return backupPath
}

function verifyPatchedTarget(targetPath: string): void {
  const source = readTargetSource(targetPath)
  if (!hasCurrentPatchFeatures(source)) {
    throw new Error('Patched Claude Code target is missing the Hippocode marker.')
  }

  const version = getClaudeVersionForTarget(targetPath)
  if (!version) {
    throw new Error('Patched Claude Code failed to start with --version.')
  }
}

function verifyUnpatchedTarget(targetPath: string): void {
  const source = readTargetSource(targetPath)
  if (isPatchedSource(source)) {
    throw new Error('Claude Code target still contains the Hippocode patch marker.')
  }

  const version = getClaudeVersionForTarget(targetPath)
  if (!version) {
    throw new Error('Restored Claude Code failed to start with --version.')
  }
}

function getCurrentTheme(): string {
  return readConfig().theme ?? 'unset'
}

function setClaudeTheme(theme: SupportedTheme, targetPath: string): void {
  if (isPixelThemeName(theme)) {
    const source = readTargetSource(targetPath)
    if (!isPatchedSource(source)) {
      throw new Error(
        `Theme "${theme}" requires a patched Claude Code build. Run claude-theme-patch install ${theme} first.`,
      )
    }
  }

  const backupPath = backupConfig()
  const config = readConfig()
  const previousTheme = config.theme ?? null

  config.theme = theme
  writeConfig(config)

  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }

  console.log(`Claude Code theme set: ${previousTheme ?? 'unset'} -> ${theme}`)
}

function clearPixelThemeIfNeeded(): void {
  const currentTheme = readConfig().theme ?? null
  if (!currentTheme || !isPixelThemeName(currentTheme)) {
    return
  }

  const backupPath = backupConfig()
  const config = readConfig()
  config.theme = null
  writeConfig(config)

  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }

  console.log(`Cleared Pixel theme from config: ${currentTheme} -> unset`)
}

function assertSupportedTheme(theme: string): asserts theme is SupportedTheme {
  const supportedThemes = new Set<string>([...OFFICIAL_THEMES, ...PIXEL_THEME_NAMES])
  if (!supportedThemes.has(theme)) {
    throw new Error(
      `Unsupported theme "${theme}". Run "claude-theme-patch list" to see supported themes.`,
    )
  }
}

function commandList(): void {
  console.log('Official Claude Code themes:')
  for (const theme of OFFICIAL_THEMES) {
    console.log(`- ${theme}`)
  }

  console.log('')
  console.log('Hippocode Pixel themes:')
  for (const seed of BASE_PIXEL_THEME_SEEDS) {
    console.log(`- ${seed.name}`)
    console.log(`- light-${seed.name}`)
  }
}

function commandStatus(targetPath: string): void {
  const source = readTargetSource(targetPath)
  const metadata = readPatchMetadata()
  const version = getClaudeVersionForTarget(targetPath)
  const parsedVersion = parseClaudeVersion(version)

  console.log(`Claude Code: ${version ?? 'unknown'}`)
  console.log(`target: ${targetPath}`)
  console.log(`patch: ${isPatchedSource(source) ? 'installed' : 'not installed'}`)
  console.log(`theme: ${getCurrentTheme()}`)
  console.log(
    `validated: ${
      isValidatedClaudeVersion(version)
        ? `yes (${parsedVersion})`
        : `no (${parsedVersion ?? 'unknown'}; validated: ${getValidatedVersionSummary()})`
    }`,
  )

  if (metadata) {
    console.log(`metadata: ${getPatchMetadataPath()}`)
    console.log(`backup: ${metadata.backupPath}`)
    console.log(`installedAt: ${metadata.installedAt}`)
    console.log(`patchedSha256: ${metadata.sha256}`)
  } else {
    console.log(`metadata: ${getPatchMetadataPath()} (missing)`)
  }
}

function commandPaths(targetPath: string): void {
  console.log(`target: ${targetPath}`)
  console.log(`config: ${getClaudeConfigPath()}`)
  console.log(`backups: ${getClaudeBackupDir()}`)
  console.log(`metadata: ${getPatchMetadataPath()}`)
}

function commandInstall(
  targetPath: string,
  theme?: SupportedTheme,
  force = false,
): void {
  let source = readTargetSource(targetPath)

  if (isPatchedSource(source)) {
    if (!hasCurrentPatchFeatures(source)) {
      const metadata = readPatchMetadata()
      if (
        !metadata ||
        metadata.targetPath !== targetPath ||
        !existsSync(metadata.backupPath)
      ) {
        throw new Error(
          'Claude Code appears patched with an older Hippocode build, but no valid backup metadata was found for upgrade.',
        )
      }

      copyFileSync(metadata.backupPath, targetPath)
      verifyUnpatchedTarget(targetPath)
      source = readTargetSource(targetPath)
      console.log(`Restored previous backup from ${metadata.backupPath}`)
    } else {
      const metadata = readPatchMetadata()
      if (!metadata) {
        throw new Error(
          'Claude Code already appears patched, but patch metadata is missing. Restore the official install before patching again.',
        )
      }

      console.log(`Patch already installed at ${targetPath}`)
    }
  }

  if (!isPatchedSource(source)) {
    const claudeVersion = assertValidatedClaudeVersion(targetPath, force)
    const backupPath = backupTargetFile(targetPath)
    const installedAt = new Date().toISOString()
    const patchedSource = patchClaudeSource(
      source,
      installedAt,
      claudeVersion,
      force,
    )

    try {
      writeFileSync(targetPath, patchedSource, 'utf8')
      verifyPatchedTarget(targetPath)
    } catch (error) {
      copyFileSync(backupPath, targetPath)
      throw error
    }

    writePatchMetadata({
      version: PATCHER_VERSION,
      targetPath,
      backupPath,
      installedAt,
      claudeVersion,
      sha256: sha256(patchedSource),
    })

    console.log(`Backed up original Claude Code to ${backupPath}`)
    console.log(`Installed Hippocode Pixel theme patch into ${targetPath}`)
  }

  if (theme) {
    setClaudeTheme(theme, targetPath)
  }
}

function commandSet(targetPath: string, theme: SupportedTheme): void {
  setClaudeTheme(theme, targetPath)
}

function commandRemove(targetPath: string): void {
  const metadata = readPatchMetadata()
  if (!metadata) {
    throw new Error(
      'No Hippocode patch metadata found. Nothing to restore automatically.',
    )
  }

  if (metadata.targetPath !== targetPath) {
    throw new Error(
      `Patch metadata points to ${metadata.targetPath}, but target resolved to ${targetPath}. Use --target ${metadata.targetPath} or restore that install first.`,
    )
  }

  if (!existsSync(metadata.backupPath)) {
    throw new Error(`Backup file is missing: ${metadata.backupPath}`)
  }

  copyFileSync(metadata.backupPath, targetPath)
  verifyUnpatchedTarget(targetPath)
  clearPixelThemeIfNeeded()
  deletePatchMetadata()

  console.log(`Restored official Claude Code from ${metadata.backupPath}`)
}

function main(rawArgv: string[]): void {
  const { targetPath: targetOverride, force, args } = parseCliOptions(rawArgv)
  const [command, value] = args

  if (command === '--help' || command === '-h' || command === undefined) {
    printUsage()
    return
  }

  switch (command) {
    case 'list':
      commandList()
      return
    case 'status':
      commandStatus(resolveClaudeTargetPath(targetOverride))
      return
    case 'install': {
      let installTheme: SupportedTheme | undefined
      if (value) {
        assertSupportedTheme(value)
        installTheme = value
      }
      commandInstall(resolveClaudeTargetPath(targetOverride), installTheme, force)
      return
    }
    case 'set':
      if (!value) {
        throw new Error('Missing theme name. Usage: claude-theme-patch set <theme>')
      }
      assertSupportedTheme(value)
      commandSet(resolveClaudeTargetPath(targetOverride), value)
      return
    case 'remove':
      commandRemove(resolveClaudeTargetPath(targetOverride))
      return
    case 'paths':
      commandPaths(resolveClaudeTargetPath(targetOverride))
      return
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

try {
  main(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
