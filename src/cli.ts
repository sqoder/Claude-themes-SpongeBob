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
} from './themeFactory.js'
import {
  applyClaudeCodePatch,
  getValidatedVersionSummary,
  isValidatedClaudeCodeVersion,
  resolveClaudeCodeAdapter,
} from './claudeCodeAdapter.js'
import {
  buildCustomThemePayload,
  createEmptyCustomThemePack,
  mergeCustomThemePacks,
  normalizeCustomThemePack,
  type StoredCustomThemePack,
} from './customThemes.js'
import {
  PATCHER_VERSION,
  PATCH_MARKER,
  hasCurrentPatchFeatures,
} from './patchRuntime.js'
import {
  buildBuiltinPatchThemePayload,
  mergePatchThemePayloads,
  type PatchThemePayload,
} from './themePayload.js'

const OFFICIAL_THEMES = [
  'dark',
  'light',
  'light-daltonized',
  'dark-daltonized',
  'light-ansi',
  'dark-ansi',
] as const

type OfficialTheme = (typeof OFFICIAL_THEMES)[number]

type SupportedTheme = string

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
  themeNames?: string[]
  customThemeCount?: number
  themePayloadSha256?: string
}

type CliOptions = {
  targetPath?: string
  themePackPath?: string
  force: boolean
  args: string[]
}

function printUsage(): void {
  console.log(`claude-theme-patch

Usage:
  claude-theme-patch init [theme]
  claude-theme-patch list
  claude-theme-patch status
  claude-theme-patch install [theme]
  claude-theme-patch sync
  claude-theme-patch set <theme>
  claude-theme-patch import-theme <json-file>
  claude-theme-patch remove
  claude-theme-patch paths

Options:
  --target <path>   Patch a specific Claude Code cli.js file
  --theme-pack <path>   Import a custom theme pack during init
  --force           Patch an unvalidated Claude Code version anyway

Notes:
  - init patches Claude Code and sets a usable theme in one command
  - install backs up the original Claude Code cli.js before patching
  - import-theme persists custom theme seeds into ~/.claude/hippocode-custom-themes.json
  - set writes ~/.claude.json and accepts official, bundled, and imported themes
  - remove restores the backup recorded in ~/.claude/hippocode-theme-patch.json`)
}

function parseCliOptions(argv: string[]): CliOptions {
  const args: string[] = []
  let targetPath: string | undefined
  let themePackPath: string | undefined
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

    if (value === '--theme-pack') {
      themePackPath = argv[index + 1]
      if (!themePackPath) {
        throw new Error('Missing path after --theme-pack')
      }
      index += 1
      continue
    }

    if (value.startsWith('--theme-pack=')) {
      themePackPath = value.slice('--theme-pack='.length)
      if (!themePackPath) {
        throw new Error('Missing path after --theme-pack=')
      }
      continue
    }

    if (value === '--force') {
      force = true
      continue
    }

    args.push(value)
  }

  return { targetPath, themePackPath, force, args }
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

function getCustomThemePackPath(): string {
  return join(homedir(), '.claude', 'hippocode-custom-themes.json')
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

function readRequiredJsonFile(path: string): Record<string, unknown> {
  const parsed = readJsonFile<Record<string, unknown>>(path)
  if (!parsed) {
    throw new Error(`JSON file not found: ${path}`)
  }

  return parsed
}

function isOfficialTheme(theme: string): theme is OfficialTheme {
  return OFFICIAL_THEMES.includes(theme as OfficialTheme)
}

function getReservedThemeNames(): string[] {
  return [...OFFICIAL_THEMES, ...PIXEL_THEME_NAMES]
}

function readCustomThemePack(): StoredCustomThemePack {
  const storedPack = readJsonFile<Record<string, unknown>>(getCustomThemePackPath())
  if (!storedPack) {
    return createEmptyCustomThemePack()
  }

  return normalizeCustomThemePack(storedPack, getReservedThemeNames())
}

function writeCustomThemePack(themePack: StoredCustomThemePack): void {
  const path = getCustomThemePackPath()
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(themePack, null, 2)}\n`, 'utf8')
}

function importCustomThemePackFromFile(jsonPath: string): {
  importedThemePack: StoredCustomThemePack
  mergedThemePack: StoredCustomThemePack
  resolvedPath: string
} {
  const resolvedPath = resolve(jsonPath)
  const importedThemePack = normalizeCustomThemePack(
    readRequiredJsonFile(resolvedPath),
    getReservedThemeNames(),
  )
  const mergedThemePack = mergeCustomThemePacks(
    readCustomThemePack(),
    importedThemePack,
  )

  writeCustomThemePack(mergedThemePack)

  return {
    importedThemePack,
    mergedThemePack,
    resolvedPath,
  }
}

function buildManagedThemePayload(): PatchThemePayload {
  return mergePatchThemePayloads(
    buildBuiltinPatchThemePayload(),
    buildCustomThemePayload(readCustomThemePack()),
  )
}

function getSupportedThemes(): string[] {
  return [...OFFICIAL_THEMES, ...buildManagedThemePayload().themeNames]
}

function getDefaultInitTheme(): SupportedTheme {
  return 'spongebob'
}

function haveSameThemeNames(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  if (!left || left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  return right.every(theme => leftSet.has(theme))
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
  themePayload: PatchThemePayload,
): string {
  const adapter = resolveClaudeCodeAdapter(
    parseClaudeVersion(versionOutput),
    force,
  )
  return applyClaudeCodePatch(source, adapter, { installedAt, themePayload })
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

function getThemePayloadSha256(themePayload: PatchThemePayload): string {
  return sha256(JSON.stringify(themePayload))
}

function setClaudeTheme(theme: SupportedTheme, targetPath: string): void {
  if (!isOfficialTheme(theme)) {
    const source = readTargetSource(targetPath)
    if (!isPatchedSource(source)) {
      throw new Error(
        `Theme "${theme}" requires a patched Claude Code build. Run claude-theme-patch install ${theme} first.`,
      )
    }

    const metadata = readPatchMetadata()
    const embeddedThemes =
      metadata?.targetPath === targetPath && Array.isArray(metadata.themeNames)
        ? metadata.themeNames
        : []

    if (!embeddedThemes.includes(theme)) {
      throw new Error(
        `Theme "${theme}" is not embedded in the current patch. Run claude-theme-patch sync or claude-theme-patch install ${theme} first.`,
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

function clearManagedThemeIfNeeded(): void {
  const currentTheme = readConfig().theme ?? null
  if (!currentTheme || isOfficialTheme(currentTheme)) {
    return
  }

  const backupPath = backupConfig()
  const config = readConfig()
  config.theme = null
  writeConfig(config)

  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }

  console.log(`Cleared managed theme from config: ${currentTheme} -> unset`)
}

function assertSupportedTheme(theme: string): asserts theme is SupportedTheme {
  if (isOfficialTheme(theme)) {
    return
  }

  const supportedThemes = new Set<string>(getSupportedThemes())
  if (!supportedThemes.has(theme)) {
    throw new Error(
      `Unsupported theme "${theme}". Run "claude-theme-patch list" to see supported themes.`,
    )
  }
}

function commandList(): void {
  const customThemePack = readCustomThemePack()

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

  console.log('')
  console.log('Imported custom themes:')
  if (customThemePack.themes.length === 0) {
    console.log('- none')
    return
  }

  for (const theme of customThemePack.themes) {
    console.log(`- ${theme.name}`)
    console.log(`- light-${theme.name}`)
  }
}

function commandStatus(targetPath: string): void {
  const source = readTargetSource(targetPath)
  const metadata = readPatchMetadata()
  const customThemePack = readCustomThemePack()
  const version = getClaudeVersionForTarget(targetPath)
  const parsedVersion = parseClaudeVersion(version)

  console.log(`Claude Code: ${version ?? 'unknown'}`)
  console.log(`target: ${targetPath}`)
  console.log(`patch: ${isPatchedSource(source) ? 'installed' : 'not installed'}`)
  console.log(`theme: ${getCurrentTheme()}`)
  console.log(`customPack: ${getCustomThemePackPath()}`)
  console.log(`customThemes: ${customThemePack.themes.length} imported`)
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
    if (Array.isArray(metadata.themeNames)) {
      console.log(
        `embeddedThemes: ${metadata.themeNames.length} managed (${metadata.customThemeCount ?? 0} custom)`,
      )
    }
  } else {
    console.log(`metadata: ${getPatchMetadataPath()} (missing)`)
  }
}

function commandPaths(targetPath: string): void {
  console.log(`target: ${targetPath}`)
  console.log(`config: ${getClaudeConfigPath()}`)
  console.log(`backups: ${getClaudeBackupDir()}`)
  console.log(`metadata: ${getPatchMetadataPath()}`)
  console.log(`customPack: ${getCustomThemePackPath()}`)
}

function commandInstall(
  targetPath: string,
  theme?: SupportedTheme,
  force = false,
): void {
  const themePayload = buildManagedThemePayload()
  const themePayloadSha256 = getThemePayloadSha256(themePayload)
  let source = readTargetSource(targetPath)
  let backupPath: string | null = null

  if (isPatchedSource(source)) {
    const metadata = readPatchMetadata()
    if (
      !metadata ||
      metadata.targetPath !== targetPath ||
      !existsSync(metadata.backupPath)
    ) {
      throw new Error(
        'Claude Code appears patched, but no valid backup metadata was found for refresh.',
      )
    }

    const needsRefresh =
      !hasCurrentPatchFeatures(source) ||
      metadata.version !== PATCHER_VERSION ||
      !haveSameThemeNames(metadata.themeNames, themePayload.themeNames) ||
      metadata.customThemeCount !== themePayload.customThemeCount ||
      metadata.themePayloadSha256 !== themePayloadSha256

    if (!needsRefresh) {
      console.log(`Patch already installed at ${targetPath}`)
    } else {
      backupPath = metadata.backupPath
      copyFileSync(backupPath, targetPath)
      verifyUnpatchedTarget(targetPath)
      source = readTargetSource(targetPath)
      console.log(`Restored previous backup from ${backupPath}`)
    }
  }

  if (!isPatchedSource(source)) {
    const claudeVersion = assertValidatedClaudeVersion(targetPath, force)
    const patchBackupPath = backupPath ?? backupTargetFile(targetPath)
    const installedAt = new Date().toISOString()
    const patchedSource = patchClaudeSource(
      source,
      installedAt,
      claudeVersion,
      force,
      themePayload,
    )

    try {
      writeFileSync(targetPath, patchedSource, 'utf8')
      verifyPatchedTarget(targetPath)
    } catch (error) {
      copyFileSync(patchBackupPath, targetPath)
      throw error
    }

    writePatchMetadata({
      version: PATCHER_VERSION,
      targetPath,
      backupPath: patchBackupPath,
      installedAt,
      claudeVersion,
      sha256: sha256(patchedSource),
      themeNames: themePayload.themeNames,
      customThemeCount: themePayload.customThemeCount,
      themePayloadSha256,
    })

    if (!backupPath) {
      console.log(`Backed up original Claude Code to ${patchBackupPath}`)
      console.log(`Installed Hippocode theme patch into ${targetPath}`)
    } else {
      console.log(`Refreshed Hippocode theme patch into ${targetPath}`)
    }
  }

  if (theme) {
    setClaudeTheme(theme, targetPath)
  }
}

function commandSync(targetPath: string, force = false): void {
  commandInstall(targetPath, undefined, force)
}

function commandSet(targetPath: string, theme: SupportedTheme): void {
  setClaudeTheme(theme, targetPath)
}

function commandInit(
  targetPath: string,
  requestedTheme: string | undefined,
  themePackPath: string | undefined,
  force = false,
): void {
  let initTheme = requestedTheme

  if (themePackPath) {
    const { importedThemePack, resolvedPath } =
      importCustomThemePackFromFile(themePackPath)

    console.log(
      `Imported ${importedThemePack.themes.length} custom theme seed(s) from ${resolvedPath} into ${getCustomThemePackPath()}`,
    )

    if (importedThemePack.themes.length > 0) {
      console.log(
        `Themes: ${importedThemePack.themes
          .map(theme => `${theme.name}, light-${theme.name}`)
          .join(', ')}`,
      )
    }

    if (!initTheme && importedThemePack.themes.length > 0) {
      initTheme = importedThemePack.themes[0]!.name
    }
  }

  const nextTheme = initTheme ?? getDefaultInitTheme()
  assertSupportedTheme(nextTheme)
  commandInstall(targetPath, nextTheme, force)

  console.log('')
  console.log(`Ready: Claude Code is patched and using "${nextTheme}".`)
  console.log('Switch later with: claude-theme-patch set <theme>')
}

function commandImportTheme(
  jsonPath: string,
  targetPathOverride?: string,
  force = false,
): void {
  const { importedThemePack, resolvedPath } =
    importCustomThemePackFromFile(jsonPath)

  console.log(
    `Imported ${importedThemePack.themes.length} custom theme seed(s) from ${resolvedPath} into ${getCustomThemePackPath()}`,
  )

  if (importedThemePack.themes.length > 0) {
    console.log(
      `Themes: ${importedThemePack.themes
        .map(theme => `${theme.name}, light-${theme.name}`)
        .join(', ')}`,
    )
  }

  const metadata = readPatchMetadata()
  const syncTarget =
    targetPathOverride ??
    (metadata && existsSync(metadata.targetPath) ? metadata.targetPath : undefined)

  if (!syncTarget) {
    console.log(
      'Custom themes were saved. Run claude-theme-patch install <theme> or claude-theme-patch sync to embed them into Claude Code.',
    )
    return
  }

  commandSync(resolveClaudeTargetPath(syncTarget), force)
  console.log('Embedded imported custom themes into the current Claude Code patch.')
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
  clearManagedThemeIfNeeded()
  deletePatchMetadata()

  console.log(`Restored official Claude Code from ${metadata.backupPath}`)
}

function main(rawArgv: string[]): void {
  const { targetPath: targetOverride, themePackPath, force, args } =
    parseCliOptions(rawArgv)
  const [command, value] = args

  if (command === '--help' || command === '-h' || command === undefined) {
    printUsage()
    return
  }

  switch (command) {
    case 'init':
      commandInit(
        resolveClaudeTargetPath(targetOverride),
        value,
        themePackPath,
        force,
      )
      return
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
    case 'sync':
      commandSync(resolveClaudeTargetPath(targetOverride), force)
      return
    case 'set':
      if (!value) {
        throw new Error('Missing theme name. Usage: claude-theme-patch set <theme>')
      }
      assertSupportedTheme(value)
      commandSet(resolveClaudeTargetPath(targetOverride), value)
      return
    case 'import-theme':
      if (!value) {
        throw new Error(
          'Missing JSON file path. Usage: claude-theme-patch import-theme <json-file>',
        )
      }
      commandImportTheme(value, targetOverride, force)
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
