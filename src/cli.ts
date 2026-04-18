#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
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
  VALIDATED_CLAUDE_CODE_VERSIONS,
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
  strategy?: 'direct-js' | 'managed-runtime-launcher'
  managedTargetPath?: string
  managedRuntimeDir?: string
  managedClaudeVersion?: string
}

type CliOptions = {
  targetPath?: string
  themePackPath?: string
  force: boolean
  args: string[]
}

type ClaudeTargetKind = 'direct-js' | 'native-wrapper'

const MANAGED_LAUNCHER_MARKER = '__HIPPOCODE_MANAGED_LAUNCHER__'
const OFFICIAL_CLAUDE_PACKAGE_NAME = '@anthropic-ai/claude-code'
const DEFAULT_MANAGED_CLAUDE_CODE_VERSION =
  VALIDATED_CLAUDE_CODE_VERSIONS.at(-1) ?? '2.1.112'

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

function getManagedRuntimeRoot(): string {
  return join(homedir(), '.claude', 'hippocode-managed-runtime')
}

function getManagedRuntimeDir(version: string): string {
  return join(getManagedRuntimeRoot(), `claude-code-${version}`)
}

function getManagedRuntimeTargetPath(version: string): string {
  return join(
    getManagedRuntimeDir(version),
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'cli.js',
  )
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

function getOfficialClaudePackageDir(targetPath: string): string | null {
  const packageDir = dirname(dirname(targetPath))
  const packageJsonPath = join(packageDir, 'package.json')
  const packageJson = readJsonFile<{ name?: string }>(packageJsonPath)

  if (packageJson?.name !== OFFICIAL_CLAUDE_PACKAGE_NAME) {
    return null
  }

  return packageDir
}

function isOfficialClaudeTarget(targetPath: string): boolean {
  return getOfficialClaudePackageDir(targetPath) !== null
}

function getClaudeBinaryCandidates(): string[] {
  try {
    return execFileSync('which', ['-a', 'claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map(path => path.trim())
      .filter(path => path !== '')
  } catch {
    return []
  }
}

function getClaudeBinaryPath(): string | null {
  const candidates = getClaudeBinaryCandidates()
  if (candidates.length === 0) {
    return null
  }

  const officialCandidate =
    candidates.find(candidate => {
      try {
        return isOfficialClaudeTarget(realpathSync(resolve(candidate)))
      } catch {
        return false
      }
    }) ?? null

  return officialCandidate ?? candidates[0] ?? null
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

function readTargetTextIfPresent(targetPath: string): string | null {
  const source = readFileSync(targetPath)
  return source.includes(0) ? null : source.toString('utf8')
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function isJavaScriptTarget(targetPath: string): boolean {
  return (
    targetPath.endsWith('.js') ||
    targetPath.endsWith('.cjs') ||
    targetPath.endsWith('.mjs')
  )
}

function getClaudeVersionForTarget(targetPath: string): string | null {
  try {
    const command = isJavaScriptTarget(targetPath) ? 'node' : targetPath
    const args = isJavaScriptTarget(targetPath)
      ? [targetPath, '--version']
      : ['--version']
    return execFileSync(command, args, {
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

function isManagedLauncherSource(source: string | null): boolean {
  return typeof source === 'string' && source.includes(MANAGED_LAUNCHER_MARKER)
}

function detectClaudeTargetKind(targetPath: string): ClaudeTargetKind {
  if (isJavaScriptTarget(targetPath)) {
    return 'direct-js'
  }

  const packageDir = getOfficialClaudePackageDir(targetPath)
  if (
    basename(targetPath) === 'claude.exe' &&
    packageDir &&
    existsSync(join(packageDir, 'cli-wrapper.cjs'))
  ) {
    return 'native-wrapper'
  }

  throw new Error(
    `Unsupported Claude Code target: ${targetPath}. Expected an official Claude Code cli.js entrypoint or npm wrapper binary.`,
  )
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

function ensureManagedRuntimePackageJson(runtimeDir: string): void {
  const packageJsonPath = join(runtimeDir, 'package.json')
  if (existsSync(packageJsonPath)) {
    return
  }

  ensureParentDir(packageJsonPath)
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(
      {
        name: 'hippocode-managed-claude-runtime',
        private: true,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function ensureManagedClaudeRuntime(
  version: string,
  refresh = false,
): {
  runtimeDir: string
  targetPath: string
} {
  const runtimeDir = getManagedRuntimeDir(version)
  const targetPath = getManagedRuntimeTargetPath(version)

  if (refresh && existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true })
  }

  if (!existsSync(targetPath)) {
    mkdirSync(runtimeDir, { recursive: true })
    ensureManagedRuntimePackageJson(runtimeDir)

    try {
      execFileSync(
        'npm',
        [
          'install',
          '--prefix',
          runtimeDir,
          '--no-save',
          `${OFFICIAL_CLAUDE_PACKAGE_NAME}@${version}`,
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      const message =
        error instanceof Error && 'message' in error ? error.message : String(error)
      throw new Error(
        `Failed to install managed Claude Code ${version}. npm install exited with: ${message}`,
      )
    }
  }

  if (!existsSync(targetPath)) {
    throw new Error(
      `Managed Claude Code runtime ${version} is missing cli.js after install: ${targetPath}`,
    )
  }

  return { runtimeDir, targetPath }
}

function buildManagedLauncherSource(managedTargetPath: string): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `# ${MANAGED_LAUNCHER_MARKER}`,
    `exec node ${JSON.stringify(managedTargetPath)} "$@"`,
    '',
  ].join('\n')
}

function installManagedLauncher(
  launcherTargetPath: string,
  managedTargetPath: string,
): void {
  writeFileSync(
    launcherTargetPath,
    buildManagedLauncherSource(managedTargetPath),
    'utf8',
  )
  chmodSync(launcherTargetPath, 0o755)
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

function verifyPatchedJavaScriptTarget(targetPath: string): void {
  const source = readTargetSource(targetPath)
  if (!hasCurrentPatchFeatures(source)) {
    throw new Error('Patched Claude Code target is missing the Hippocode marker.')
  }

  const version = getClaudeVersionForTarget(targetPath)
  if (!version) {
    throw new Error('Patched Claude Code failed to start with --version.')
  }
}

function verifyUnpatchedJavaScriptTarget(targetPath: string): void {
  const source = readTargetSource(targetPath)
  if (isPatchedSource(source)) {
    throw new Error('Claude Code target still contains the Hippocode patch marker.')
  }

  const version = getClaudeVersionForTarget(targetPath)
  if (!version) {
    throw new Error('Restored Claude Code failed to start with --version.')
  }
}

function verifyManagedLauncherTarget(
  launcherTargetPath: string,
  managedTargetPath: string,
): void {
  verifyPatchedJavaScriptTarget(managedTargetPath)

  if (!isManagedLauncherSource(readTargetTextIfPresent(launcherTargetPath))) {
    throw new Error('Managed Claude launcher marker is missing from the target.')
  }

  if (!getClaudeVersionForTarget(launcherTargetPath)) {
    throw new Error('Managed Claude launcher failed to start with --version.')
  }
}

function verifyRestoredTarget(targetPath: string): void {
  const targetText = readTargetTextIfPresent(targetPath)
  if (isManagedLauncherSource(targetText)) {
    throw new Error('Restored Claude Code target still contains the managed launcher.')
  }

  if (isJavaScriptTarget(targetPath)) {
    verifyUnpatchedJavaScriptTarget(targetPath)
    return
  }

  if (!getClaudeVersionForTarget(targetPath)) {
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
    const metadata = readPatchMetadata()
    const patchSourcePath =
      metadata?.targetPath === targetPath &&
      metadata.strategy === 'managed-runtime-launcher' &&
      metadata.managedTargetPath
        ? metadata.managedTargetPath
        : targetPath

    const source = readTargetSource(patchSourcePath)
    if (!isPatchedSource(source)) {
      throw new Error(
        `Theme "${theme}" requires a patched Claude Code build. Run claude-theme-patch install ${theme} first.`,
      )
    }

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
  const metadata = readPatchMetadata()
  const customThemePack = readCustomThemePack()
  const version = getClaudeVersionForTarget(targetPath)
  const parsedVersion = parseClaudeVersion(version)
  const patchSourcePath =
    metadata?.targetPath === targetPath &&
    metadata.strategy === 'managed-runtime-launcher' &&
    metadata.managedTargetPath
      ? metadata.managedTargetPath
      : targetPath
  const patchInstalled =
    existsSync(patchSourcePath) && isJavaScriptTarget(patchSourcePath)
      ? isPatchedSource(readTargetSource(patchSourcePath))
      : isManagedLauncherSource(readTargetTextIfPresent(targetPath))

  console.log(`Claude Code: ${version ?? 'unknown'}`)
  console.log(`target: ${targetPath}`)
  console.log(`patch: ${patchInstalled ? 'installed' : 'not installed'}`)
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
    if (metadata.strategy) {
      console.log(`strategy: ${metadata.strategy}`)
    }
    if (metadata.managedRuntimeDir) {
      console.log(`managedRuntime: ${metadata.managedRuntimeDir}`)
    }
    if (metadata.managedTargetPath) {
      console.log(`managedTarget: ${metadata.managedTargetPath}`)
    }
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
  console.log(`managedRuntimeRoot: ${getManagedRuntimeRoot()}`)
}

function installPatchIntoFreshJavaScriptTarget(
  targetPath: string,
  themePayload: PatchThemePayload,
  force: boolean,
): {
  claudeVersion: string | null
  installedAt: string
  patchedSource: string
} {
  const source = readTargetSource(targetPath)
  const claudeVersion = assertValidatedClaudeVersion(targetPath, force)
  const installedAt = new Date().toISOString()
  const patchedSource = patchClaudeSource(
    source,
    installedAt,
    claudeVersion,
    force,
    themePayload,
  )

  writeFileSync(targetPath, patchedSource, 'utf8')
  verifyPatchedJavaScriptTarget(targetPath)

  return {
    claudeVersion,
    installedAt,
    patchedSource,
  }
}

function commandInstallDirectJavaScriptTarget(
  targetPath: string,
  themePayload: PatchThemePayload,
  themePayloadSha256: string,
  theme: SupportedTheme | undefined,
  force: boolean,
): void {
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
      verifyUnpatchedJavaScriptTarget(targetPath)
      source = readTargetSource(targetPath)
      console.log(`Restored previous backup from ${backupPath}`)
    }
  }

  if (!isPatchedSource(source)) {
    const patchBackupPath = backupPath ?? backupTargetFile(targetPath)

    try {
      const { claudeVersion, installedAt, patchedSource } =
        installPatchIntoFreshJavaScriptTarget(targetPath, themePayload, force)

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
        strategy: 'direct-js',
      })
    } catch (error) {
      copyFileSync(patchBackupPath, targetPath)
      throw error
    }

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

function commandInstallManagedRuntimeLauncher(
  targetPath: string,
  themePayload: PatchThemePayload,
  themePayloadSha256: string,
  theme: SupportedTheme | undefined,
  force: boolean,
): void {
  const metadata = readPatchMetadata()
  const existingLauncherSource = readTargetTextIfPresent(targetPath)
  const managedVersion = DEFAULT_MANAGED_CLAUDE_CODE_VERSION
  const currentManagedTargetPath =
    metadata?.targetPath === targetPath &&
    metadata.strategy === 'managed-runtime-launcher' &&
    metadata.managedTargetPath
      ? metadata.managedTargetPath
      : getManagedRuntimeTargetPath(managedVersion)
  const managedSource =
    existsSync(currentManagedTargetPath) && isJavaScriptTarget(currentManagedTargetPath)
      ? readTargetSource(currentManagedTargetPath)
      : null
  const managedPatchInstalled =
    managedSource !== null && hasCurrentPatchFeatures(managedSource)
  const needsRefresh =
    !metadata ||
    metadata.targetPath !== targetPath ||
    metadata.strategy !== 'managed-runtime-launcher' ||
    !existsSync(metadata.backupPath) ||
    !isManagedLauncherSource(existingLauncherSource) ||
    metadata.version !== PATCHER_VERSION ||
    !haveSameThemeNames(metadata.themeNames, themePayload.themeNames) ||
    metadata.customThemeCount !== themePayload.customThemeCount ||
    metadata.themePayloadSha256 !== themePayloadSha256 ||
    metadata.managedClaudeVersion !== managedVersion ||
    !managedPatchInstalled
  const launcherBackupPath =
    metadata?.targetPath === targetPath &&
    metadata.strategy === 'managed-runtime-launcher' &&
    existsSync(metadata.backupPath)
      ? metadata.backupPath
      : backupTargetFile(targetPath)
  const { runtimeDir, targetPath: managedTargetPath } = ensureManagedClaudeRuntime(
    managedVersion,
    needsRefresh,
  )
  let patchResult:
    | {
        claudeVersion: string | null
        installedAt: string
        patchedSource: string
      }
    | undefined

  if (!needsRefresh) {
    console.log(`Managed launcher already installed at ${targetPath}`)
  } else {
    try {
      patchResult = installPatchIntoFreshJavaScriptTarget(
        managedTargetPath,
        themePayload,
        force,
      )
      installManagedLauncher(targetPath, managedTargetPath)
      verifyManagedLauncherTarget(targetPath, managedTargetPath)
    } catch (error) {
      copyFileSync(launcherBackupPath, targetPath)
      throw error
    }

    writePatchMetadata({
      version: PATCHER_VERSION,
      targetPath,
      backupPath: launcherBackupPath,
      installedAt: patchResult.installedAt,
      claudeVersion: patchResult.claudeVersion,
      sha256: sha256(patchResult.patchedSource),
      themeNames: themePayload.themeNames,
      customThemeCount: themePayload.customThemeCount,
      themePayloadSha256,
      strategy: 'managed-runtime-launcher',
      managedTargetPath,
      managedRuntimeDir: runtimeDir,
      managedClaudeVersion: managedVersion,
    })

    if (
      metadata?.targetPath === targetPath &&
      metadata.strategy === 'managed-runtime-launcher'
    ) {
      console.log(`Refreshed Hippocode managed launcher at ${targetPath}`)
    } else {
      console.log(`Backed up official Claude launcher to ${launcherBackupPath}`)
      console.log(
        `Installed Hippocode managed launcher into ${targetPath} using Claude Code ${managedVersion}`,
      )
    }
  }

  if (theme) {
    setClaudeTheme(theme, targetPath)
  }
}

function commandInstall(
  targetPath: string,
  theme?: SupportedTheme,
  force = false,
): void {
  const themePayload = buildManagedThemePayload()
  const themePayloadSha256 = getThemePayloadSha256(themePayload)
  switch (detectClaudeTargetKind(targetPath)) {
    case 'direct-js':
      commandInstallDirectJavaScriptTarget(
        targetPath,
        themePayload,
        themePayloadSha256,
        theme,
        force,
      )
      return
    case 'native-wrapper':
      commandInstallManagedRuntimeLauncher(
        targetPath,
        themePayload,
        themePayloadSha256,
        theme,
        force,
      )
      return
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
  verifyRestoredTarget(targetPath)
  clearManagedThemeIfNeeded()
  deletePatchMetadata()

  if (
    metadata.strategy === 'managed-runtime-launcher' &&
    metadata.managedRuntimeDir &&
    existsSync(metadata.managedRuntimeDir)
  ) {
    rmSync(metadata.managedRuntimeDir, { recursive: true, force: true })
  }

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
