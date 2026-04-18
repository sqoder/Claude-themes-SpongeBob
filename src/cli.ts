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
  buildPixelSpritePayload,
  buildPixelStartupPosePayload,
  buildPixelThemePayload,
  buildThemePickerOptions,
  isPixelThemeName,
} from './themeFactory.js'

const PATCHER_VERSION = '0.1.19'
const PATCH_MARKER = '__HIPPOCODE_THEME_PATCH__'
const PATCH_THEME_GLOBAL = '__hippocodePixelThemes'
const PATCH_THEME_PICKER_OPTIONS_GLOBAL = '__hippocodeThemePickerOptions'
const PATCH_PIXEL_SPRITES_GLOBAL = '__hippocodePixelSprites'
const PATCH_PIXEL_POSES_GLOBAL = '__hippocodePixelStartupPoses'
const PATCH_MASCOT_RENDERER_GLOBAL = '__hippocodeRenderPixelMascot'
const PATCH_ACTIVE_THEME_GLOBAL = '__hippocodeActiveTheme'
const PATCH_DIFF_THEME_PALETTE_GLOBAL = '__hippocodeBuildDiffThemePalette'
const PATCH_SYNTAX_THEME_NAME_GLOBAL = '__hippocodeGetSyntaxThemeName'
const PATCH_THEME_COMMAND_RESTART_HINT =
  'Restart Claude Code to refresh the startup pixel showcase.'
const THEME_LIST_PATTERN =
  /([A-Za-z0-9_$]+)=\["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"\],([A-Za-z0-9_$]+)=\["auto",\.\.\.\1\],/s
const THEME_RESOLVER_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{switch\(q\)\{case"light":return/
const THEME_PICKER_PATTERN =
  /S=\[\{label:"Auto \(match terminal\)",value:"auto"\},\{label:"Dark mode",value:"dark"\},\{label:"Light mode",value:"light"\},\{label:"Dark mode \(colorblind-friendly\)",value:"dark-daltonized"\},\{label:"Light mode \(colorblind-friendly\)",value:"light-daltonized"\},\{label:"Dark mode \(ANSI colors only\)",value:"dark-ansi"\},\{label:"Light mode \(ANSI colors only\)",value:"light-ansi"\}\],K\[(\d+)\]=S;/
const STARTUP_MASCOT_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{let K=s\(26\),_;if\(K\[0\]!==q\)_=q===void 0\?\{\}:q,K\[0\]=q,K\[1\]=_;else _=K\[1\];let\{pose:z\}=_,Y=z===void 0\?"default":z;/
const LOGO_V2_PATTERN =
  /function ([A-Za-z0-9_$]+)\(\)\{let q=s\(94\),K=wdK\(\),_=H8\(\)\.oauthAccount\?\.displayName\?\?"",\{columns:z\}=s1\(\),Y;/
const LOGO_THEME_COLOR_PATTERN = /let A6=zdK\(z\),e=Ad\(H8\(\)\.theme\),i=/
const LOGO_COMPACT_MASCOT_PATTERN =
  /let w6;if\(q\[37\]===Symbol\.for\("react\.memo_cache_sentinel"\)\)w6=V7\.createElement\(u,\{marginY:1\},V7\.createElement\(sP6,null\)\),q\[37\]=w6;else w6=q\[37\];/
const LOGO_FULL_MASCOT_PATTERN =
  /let y6;if\(q\[50\]===Symbol\.for\("react\.memo_cache_sentinel"\)\)y6=V7\.createElement\(sP6,null\),q\[50\]=y6;else y6=q\[50\];/
const THEME_PICKER_VISIBLE_OPTION_COUNT_PATTERN =
  /visibleOptionCount:F\.length/g
const THEME_COMMAND_RESULT_PATTERN =
  /Y=\(w\)=>\{z\(w\),_\(`Theme set to \$\{w\}`\)\}/
const SYNTAX_THEME_NAME_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{if\(q\.includes\("ansi"\)\)return"ansi";if\(q\.includes\("dark"\)\)return"Monokai Extended";return"GitHub"\}/
const DIFF_THEME_PALETTE_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q,K\)\{let _=q\.includes\("dark"\),z=q\.includes\("ansi"\),Y=q\.includes\("daltonized"\),A=K==="truecolor";if\(z\)return\{addLine:Ae,addWord:Ae,addDecoration:H0\(10\),deleteLine:Ae,deleteWord:Ae,deleteDecoration:H0\(9\),foreground:H0\(7\),background:Ae,scopes:S9Y\};if\(_\)\{let H=JK\(248,248,242\),J=JK\(61,1,0\),X=JK\(92,2,0\),M=JK\(220,90,90\);if\(Y\)return\{addLine:A\?JK\(0,27,41\):H0\(17\),addWord:A\?JK\(0,48,71\):H0\(24\),addDecoration:JK\(81,160,200\),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK\};return\{addLine:A\?JK\(2,40,0\):H0\(22\),addWord:A\?JK\(4,71,0\):H0\(28\),addDecoration:JK\(80,200,80\),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK\}\}let O=JK\(51,51,51\),w=JK\(255,220,220\),\$=JK\(255,199,199\),j=JK\(207,34,46\);if\(Y\)return\{addLine:JK\(219,237,255\),addWord:JK\(179,217,255\),addDecoration:JK\(36,87,138\),deleteLine:w,deleteWord:\$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK\};return\{addLine:JK\(220,255,220\),addWord:JK\(178,255,178\),addDecoration:JK\(36,138,61\),deleteLine:w,deleteWord:\$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK\}\}/

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

const VALIDATED_CLAUDE_CODE_VERSIONS = ['2.1.112'] as const
const VALIDATED_CLAUDE_CODE_VERSION_SET = new Set<string>(
  VALIDATED_CLAUDE_CODE_VERSIONS,
)

const PIXEL_DARK_COLORS = {
  Y: 'rgb(253,216,53)',
  W: 'rgb(255,255,255)',
  B: 'rgb(25,118,210)',
  N: 'rgb(232,168,124)',
  S: 'rgb(109,76,65)',
  P: 'rgb(244,143,177)',
  G: 'rgb(102,187,106)',
  T: 'rgb(38,166,154)',
  R: 'rgb(239,83,80)',
  E: 'rgb(144,164,174)',
  H: 'rgb(255,224,178)',
  O: 'rgb(255,152,0)',
  M: 'rgb(123,31,162)',
  A: 'rgb(144,202,249)',
  C: 'rgb(2,119,189)',
  D: 'rgb(156,204,101)',
  L: 'rgb(255,249,196)',
} as const

const PIXEL_LIGHT_COLORS = {
  Y: 'rgb(245,191,0)',
  W: 'rgb(220,220,220)',
  B: 'rgb(25,118,210)',
  N: 'rgb(215,140,90)',
  S: 'rgb(109,76,65)',
  P: 'rgb(240,98,146)',
  G: 'rgb(56,142,60)',
  T: 'rgb(0,121,107)',
  R: 'rgb(211,47,47)',
  E: 'rgb(38,50,56)',
  H: 'rgb(255,183,77)',
  O: 'rgb(245,124,0)',
  M: 'rgb(123,31,162)',
  A: 'rgb(33,150,243)',
  C: 'rgb(2,119,189)',
  D: 'rgb(104,159,56)',
  L: 'rgb(251,192,45)',
} as const

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
  const version = parseClaudeVersion(versionOutput)
  return version !== null && VALIDATED_CLAUDE_CODE_VERSION_SET.has(version)
}

function getValidatedVersionSummary(): string {
  return VALIDATED_CLAUDE_CODE_VERSIONS.join(', ')
}

function assertValidatedClaudeVersion(targetPath: string, force: boolean): void {
  const versionOutput = getClaudeVersionForTarget(targetPath)
  if (isValidatedClaudeVersion(versionOutput)) {
    return
  }

  const versionLabel = versionOutput ?? 'unknown'
  const message =
    `Claude Code ${versionLabel} has not been validated with claude-code-theme-patcher ${PATCHER_VERSION}. ` +
    `Validated versions: ${getValidatedVersionSummary()}.`

  if (!force) {
    throw new Error(`${message} Re-run with --force to patch anyway.`)
  }

  console.warn(`${message} Proceeding because --force was provided.`)
}

function isPatchedSource(source: string): boolean {
  return source.includes(PATCH_MARKER)
}

function hasCurrentPatchFeatures(source: string): boolean {
  return (
    isPatchedSource(source) &&
    source.includes(`"version":"${PATCHER_VERSION}"`) &&
    source.includes(PATCH_THEME_PICKER_OPTIONS_GLOBAL) &&
    source.includes(PATCH_MASCOT_RENDERER_GLOBAL) &&
    source.includes(PATCH_DIFF_THEME_PALETTE_GLOBAL) &&
    source.includes(PATCH_SYNTAX_THEME_NAME_GLOBAL) &&
    source.includes(PATCH_THEME_COMMAND_RESTART_HINT)
  )
}

function buildSupportedThemeList(existingThemes: string[]): string[] {
  return [...new Set([...existingThemes, ...PIXEL_THEME_NAMES])]
}

function buildPixelMascotRendererSource(): string {
  return `function(__hippocodeReact,__hippocodeBox,__hippocodeText,__hippocodeTheme,__hippocodePose){var __hippocodeThemes=globalThis.${PATCH_THEME_GLOBAL};if(!__hippocodeThemes||typeof __hippocodeTheme!=="string"||!__hippocodeThemes[__hippocodeTheme])return null;var __hippocodeBase=__hippocodeTheme.replace(/^light-/,"");var __hippocodePoses=globalThis.${PATCH_PIXEL_POSES_GLOBAL}||{};var __hippocodeSprites=globalThis.${PATCH_PIXEL_SPRITES_GLOBAL}||{};var __hippocodeRows=(__hippocodePoses[__hippocodeBase]&&__hippocodePoses[__hippocodeBase][__hippocodePose])||(__hippocodePoses[__hippocodeBase]&&__hippocodePoses[__hippocodeBase].default)||__hippocodeSprites[__hippocodeBase];if(!Array.isArray(__hippocodeRows)||__hippocodeRows.length===0)return null;var __hippocodeGlyphs=[" ","▘","▝","▀","▖","▌","▞","▛","▗","▚","▐","▜","▄","▙","▟","█"];var __hippocodeColor=__hippocodeThemes[__hippocodeTheme].clawd_body;var __hippocodeWidth=0;for(var __hippocodeWidthIndex=0;__hippocodeWidthIndex<__hippocodeRows.length;__hippocodeWidthIndex+=1){var __hippocodeCandidate=__hippocodeRows[__hippocodeWidthIndex];if(typeof __hippocodeCandidate==="string"&&__hippocodeCandidate.length>__hippocodeWidth)__hippocodeWidth=__hippocodeCandidate.length}if(__hippocodeWidth===0)return null;var __hippocodeLines=[];for(var __hippocodeRowIndex=0;__hippocodeRowIndex<__hippocodeRows.length;__hippocodeRowIndex+=2){var __hippocodeTop=__hippocodeRows[__hippocodeRowIndex]||"";var __hippocodeBottom=__hippocodeRows[__hippocodeRowIndex+1]||"";var __hippocodeCells=[];for(var __hippocodeColumnIndex=0;__hippocodeColumnIndex<__hippocodeWidth;__hippocodeColumnIndex+=2){var __hippocodeTopLeft=(__hippocodeTop[__hippocodeColumnIndex]||".")!==".";var __hippocodeTopRight=(__hippocodeTop[__hippocodeColumnIndex+1]||".")!==".";var __hippocodeBottomLeft=(__hippocodeBottom[__hippocodeColumnIndex]||".")!==".";var __hippocodeBottomRight=(__hippocodeBottom[__hippocodeColumnIndex+1]||".")!==".";var __hippocodeMask=(__hippocodeTopLeft?1:0)|(__hippocodeTopRight?2:0)|(__hippocodeBottomLeft?4:0)|(__hippocodeBottomRight?8:0);var __hippocodeGlyph=__hippocodeGlyphs[__hippocodeMask]||" ";if(__hippocodeMask===0){__hippocodeCells.push(__hippocodeReact.createElement(__hippocodeText,{key:"c"+__hippocodeRowIndex+"-"+__hippocodeColumnIndex}," "));continue}__hippocodeCells.push(__hippocodeReact.createElement(__hippocodeText,{key:"c"+__hippocodeRowIndex+"-"+__hippocodeColumnIndex,color:__hippocodeColor},__hippocodeGlyph))}__hippocodeLines.push(__hippocodeReact.createElement(__hippocodeText,{key:"r"+__hippocodeRowIndex},__hippocodeCells))}return __hippocodeReact.createElement(__hippocodeBox,{flexDirection:"column"},__hippocodeLines)}`
}

function buildDiffThemePaletteSource(): string {
  return `function(__hippocodeThemeName,__hippocodeColorMode,__hippocodeRgb,__hippocodeAnsi,__hippocodeTransparent,__hippocodeDarkScopes,__hippocodeLightScopes,__hippocodeAnsiScopes){var __hippocodeThemes=globalThis.${PATCH_THEME_GLOBAL};var __hippocodeTheme=__hippocodeThemes&&__hippocodeThemes[__hippocodeThemeName];if(!__hippocodeTheme)return null;var __hippocodeParse=function(__hippocodeValue,__hippocodeFallback){if(typeof __hippocodeValue!=="string")return __hippocodeFallback;var __hippocodeMatch=__hippocodeValue.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);if(!__hippocodeMatch)return __hippocodeFallback;return __hippocodeRgb(Number.parseInt(__hippocodeMatch[1],10),Number.parseInt(__hippocodeMatch[2],10),Number.parseInt(__hippocodeMatch[3],10));};var __hippocodeDark=__hippocodeThemeName.includes("dark");var __hippocodeScopes=Object.assign({},__hippocodeDark?__hippocodeDarkScopes:__hippocodeLightScopes);var __hippocodeSetScope=function(__hippocodeKey,__hippocodeValue){if(typeof __hippocodeValue==="string")__hippocodeScopes[__hippocodeKey]=__hippocodeParse(__hippocodeValue,__hippocodeScopes[__hippocodeKey]);};__hippocodeSetScope("keyword",__hippocodeTheme.syntaxKeyword);__hippocodeSetScope("_storage",__hippocodeTheme.syntaxStorage||__hippocodeTheme.syntaxKeyword);__hippocodeSetScope("built_in",__hippocodeTheme.syntaxBuiltIn);__hippocodeSetScope("type",__hippocodeTheme.syntaxType);__hippocodeSetScope("literal",__hippocodeTheme.syntaxLiteral);__hippocodeSetScope("number",__hippocodeTheme.syntaxNumber);__hippocodeSetScope("string",__hippocodeTheme.syntaxString);__hippocodeSetScope("title",__hippocodeTheme.syntaxTitle);__hippocodeSetScope("params",__hippocodeTheme.syntaxParams);__hippocodeSetScope("comment",__hippocodeTheme.syntaxComment);__hippocodeSetScope("meta",__hippocodeTheme.syntaxMeta);__hippocodeSetScope("attr",__hippocodeTheme.syntaxAttr);__hippocodeSetScope("attribute",__hippocodeTheme.syntaxAttribute);__hippocodeSetScope("variable",__hippocodeTheme.syntaxVariable);__hippocodeSetScope("variable.language",__hippocodeTheme.syntaxVariableLanguage);__hippocodeSetScope("property",__hippocodeTheme.syntaxProperty);__hippocodeSetScope("operator",__hippocodeTheme.syntaxOperator);__hippocodeSetScope("punctuation",__hippocodeTheme.syntaxPunctuation);__hippocodeSetScope("symbol",__hippocodeTheme.syntaxSymbol);__hippocodeSetScope("regexp",__hippocodeTheme.syntaxRegexp);__hippocodeSetScope("subst",__hippocodeTheme.syntaxSubst);return{addLine:__hippocodeParse(__hippocodeTheme.diffAddedDimmed||__hippocodeTheme.diffAdded,__hippocodeDark?__hippocodeRgb(2,40,0):__hippocodeRgb(220,255,220)),addWord:__hippocodeParse(__hippocodeTheme.diffAdded||__hippocodeTheme.diffAddedWord,__hippocodeDark?__hippocodeRgb(4,71,0):__hippocodeRgb(178,255,178)),addDecoration:__hippocodeParse(__hippocodeTheme.diffAddedWord||__hippocodeTheme.claude,__hippocodeDark?__hippocodeRgb(80,200,80):__hippocodeRgb(36,138,61)),deleteLine:__hippocodeParse(__hippocodeTheme.diffRemovedDimmed||__hippocodeTheme.diffRemoved,__hippocodeDark?__hippocodeRgb(61,1,0):__hippocodeRgb(255,220,220)),deleteWord:__hippocodeParse(__hippocodeTheme.diffRemoved||__hippocodeTheme.diffRemovedWord,__hippocodeDark?__hippocodeRgb(92,2,0):__hippocodeRgb(255,199,199)),deleteDecoration:__hippocodeParse(__hippocodeTheme.diffRemovedWord||__hippocodeTheme.error,__hippocodeDark?__hippocodeRgb(220,90,90):__hippocodeRgb(207,34,46)),foreground:__hippocodeParse(__hippocodeTheme.text,__hippocodeDark?__hippocodeRgb(248,248,242):__hippocodeRgb(51,51,51)),background:__hippocodeTransparent,scopes:__hippocodeScopes}}`
}

function buildSyntaxThemeNameSource(): string {
  return `function(__hippocodeThemeName){var __hippocodeOptions=globalThis.${PATCH_THEME_PICKER_OPTIONS_GLOBAL};if(Array.isArray(__hippocodeOptions)){for(var __hippocodeIndex=0;__hippocodeIndex<__hippocodeOptions.length;__hippocodeIndex+=1){var __hippocodeOption=__hippocodeOptions[__hippocodeIndex];if(__hippocodeOption&&__hippocodeOption.value===__hippocodeThemeName&&typeof __hippocodeOption.label==="string")return __hippocodeOption.label.replace(/\\s+pixel theme$/i,"")}}return null}`
}

function buildPatchAssignments(installedAt: string): string {
  const patchInfo = {
    patcher: 'claude-code-theme-patcher',
    version: PATCHER_VERSION,
    installedAt,
    pixelThemeCount: PIXEL_THEME_NAMES.length,
  }

  return [
    `globalThis.${PATCH_MARKER}=${JSON.stringify(patchInfo)}`,
    `globalThis.${PATCH_THEME_GLOBAL}=${JSON.stringify(buildPixelThemePayload())}`,
    `globalThis.${PATCH_THEME_PICKER_OPTIONS_GLOBAL}=${JSON.stringify(buildThemePickerOptions())}`,
    `globalThis.${PATCH_PIXEL_SPRITES_GLOBAL}=${JSON.stringify(buildPixelSpritePayload())}`,
    `globalThis.${PATCH_PIXEL_POSES_GLOBAL}=${JSON.stringify(buildPixelStartupPosePayload())}`,
    `globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}=${buildPixelMascotRendererSource()}`,
    `globalThis.${PATCH_DIFF_THEME_PALETTE_GLOBAL}=${buildDiffThemePaletteSource()}`,
    `globalThis.${PATCH_SYNTAX_THEME_NAME_GLOBAL}=${buildSyntaxThemeNameSource()}`,
    `globalThis.${PATCH_ACTIVE_THEME_GLOBAL}=typeof globalThis.${PATCH_ACTIVE_THEME_GLOBAL}==="string"?globalThis.${PATCH_ACTIVE_THEME_GLOBAL}:void 0`,
  ].join(',') + ','
}

function patchThemeRegistry(source: string, installedAt: string): string {
  const themeListMatch = source.match(THEME_LIST_PATTERN)
  if (!themeListMatch) {
    throw new Error(
      'Could not find Claude Code theme option list. This Claude Code build is not compatible with the current patcher.',
    )
  }

  const existingThemes = Array.from(
    themeListMatch[0].matchAll(/"([^"]+)"/g),
    match => match[1]!,
  ).filter(theme => theme !== 'auto')

  if (existingThemes.length === 0) {
    throw new Error('Claude Code theme option list was empty. Aborting patch.')
  }

  const extendedThemes = buildSupportedThemeList(existingThemes)
  const nextThemeList = `$1=${JSON.stringify(extendedThemes)},$2=["auto",...$1],${buildPatchAssignments(installedAt)}`
  const patchedSource = source.replace(THEME_LIST_PATTERN, nextThemeList)

  if (patchedSource === source) {
    throw new Error('Failed to extend Claude Code theme option list.')
  }

  return patchedSource
}

function patchThemeResolver(source: string): string {
  const resolverGuard = `if(globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[q])return globalThis.${PATCH_THEME_GLOBAL}[q];`
  const nextResolver = `function $1(q){if(globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[q])return globalThis.${PATCH_THEME_GLOBAL}[q];switch(q){case"light":return`
  const patchedSource = source.replace(THEME_RESOLVER_PATTERN, nextResolver)

  if (patchedSource === source || !patchedSource.includes(resolverGuard)) {
    throw new Error('Failed to inject Hippocode Pixel theme resolver.')
  }

  return patchedSource
}

function patchThemePickerOptions(source: string): string {
  let patchedSource = source.replace(
    THEME_PICKER_PATTERN,
    `S=globalThis.${PATCH_THEME_PICKER_OPTIONS_GLOBAL}||${JSON.stringify(buildThemePickerOptions())},K[$1]=S;`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to inject Hippocode Pixel themes into /theme.')
  }

  patchedSource = patchedSource.replace(
    THEME_PICKER_VISIBLE_OPTION_COUNT_PATTERN,
    'visibleOptionCount:Math.min(F.length,10)',
  )

  return patchedSource
}

function patchStartupMascot(source: string): string {
  const patchedSource = source.replace(
    STARTUP_MASCOT_PATTERN,
    `function $1(q){let K=s(26),_;if(K[0]!==q)_=q===void 0?{}:q,K[0]=q,K[1]=_;else _=K[1];let __hippocodeThemeTuple=typeof Zq==="function"?Zq():null,{pose:z}=_,Y=z===void 0?"default":z,__hippocodeTheme=Array.isArray(__hippocodeThemeTuple)&&typeof __hippocodeThemeTuple[0]==="string"?__hippocodeThemeTuple[0]:typeof globalThis.${PATCH_ACTIVE_THEME_GLOBAL}==="string"?globalThis.${PATCH_ACTIVE_THEME_GLOBAL}:typeof H8==="function"?H8().theme:void 0;let __hippocodeMascot=globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}?globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}(cz,u,T,__hippocodeTheme,Y):null;if(__hippocodeMascot)return __hippocodeMascot;`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to patch Claude Code startup mascot.')
  }

  return patchedSource
}

function patchLogoThemeRefresh(source: string): string {
  let patchedSource = source.replace(
    LOGO_V2_PATTERN,
    `function $1(){let q=s(94),__hippocodeThemeTuple=typeof Zq==="function"?Zq():null,__hippocodeLiveTheme=Array.isArray(__hippocodeThemeTuple)&&typeof __hippocodeThemeTuple[0]==="string"?__hippocodeThemeTuple[0]:typeof globalThis.${PATCH_ACTIVE_THEME_GLOBAL}==="string"?globalThis.${PATCH_ACTIVE_THEME_GLOBAL}:typeof H8==="function"?H8().theme:"dark",K=wdK(),_=H8().oauthAccount?.displayName??"",{columns:z}=s1(),Y;`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to patch Claude Code logo header theme subscription.')
  }

  patchedSource = patchedSource.replace(
    LOGO_THEME_COLOR_PATTERN,
    'let A6=zdK(z),e=Ad(__hippocodeLiveTheme),i=',
  )

  patchedSource = patchedSource.replace(
    LOGO_COMPACT_MASCOT_PATTERN,
    'let w6=V7.createElement(u,{marginY:1,key:__hippocodeLiveTheme},V7.createElement(sP6,{key:__hippocodeLiveTheme}));',
  )

  patchedSource = patchedSource.replace(
    LOGO_FULL_MASCOT_PATTERN,
    'let y6=V7.createElement(sP6,{key:__hippocodeLiveTheme});',
  )

  if (
    !patchedSource.includes('__hippocodeLiveTheme') ||
    !patchedSource.includes('key:__hippocodeLiveTheme')
  ) {
    throw new Error('Failed to wire Claude Code logo header to the live theme.')
  }

  return patchedSource
}

function patchThemeCommandResult(source: string): string {
  const patchedSource = source.replace(
    THEME_COMMAND_RESULT_PATTERN,
    `Y=(w)=>{globalThis.${PATCH_ACTIVE_THEME_GLOBAL}=w,z(w),globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[w]?_(\`Theme set to \${w}. ${PATCH_THEME_COMMAND_RESTART_HINT}\`):_(\`Theme set to \${w}\`)}`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to patch /theme completion message for Pixel themes.')
  }

  return patchedSource
}

function patchSyntaxThemeName(source: string): string {
  const patchedSource = source.replace(
    SYNTAX_THEME_NAME_PATTERN,
    `function $1(q){var __hippocodeThemeName=globalThis.${PATCH_SYNTAX_THEME_NAME_GLOBAL}?globalThis.${PATCH_SYNTAX_THEME_NAME_GLOBAL}(q):null;if(typeof __hippocodeThemeName==="string")return __hippocodeThemeName;if(q.includes("ansi"))return"ansi";if(q.includes("dark"))return"Monokai Extended";return"GitHub"}`,
  )

  if (
    patchedSource === source ||
    !patchedSource.includes(PATCH_SYNTAX_THEME_NAME_GLOBAL)
  ) {
    throw new Error('Failed to patch syntax preview theme naming.')
  }

  return patchedSource
}

function patchDiffThemePalette(source: string): string {
  const patchedSource = source.replace(
    DIFF_THEME_PALETTE_PATTERN,
    `function $1(q,K){var __hippocodePaletteFactory=globalThis.${PATCH_DIFF_THEME_PALETTE_GLOBAL};var __hippocodePalette=__hippocodePaletteFactory?__hippocodePaletteFactory(q,K,JK,H0,Ae,uMK,mMK,S9Y):null;if(__hippocodePalette)return __hippocodePalette;let _=q.includes("dark"),z=q.includes("ansi"),Y=q.includes("daltonized"),A=K==="truecolor";if(z)return{addLine:Ae,addWord:Ae,addDecoration:H0(10),deleteLine:Ae,deleteWord:Ae,deleteDecoration:H0(9),foreground:H0(7),background:Ae,scopes:S9Y};if(_){let H=JK(248,248,242),J=JK(61,1,0),X=JK(92,2,0),M=JK(220,90,90);if(Y)return{addLine:A?JK(0,27,41):H0(17),addWord:A?JK(0,48,71):H0(24),addDecoration:JK(81,160,200),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK};return{addLine:A?JK(2,40,0):H0(22),addWord:A?JK(4,71,0):H0(28),addDecoration:JK(80,200,80),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK}}let O=JK(51,51,51),w=JK(255,220,220),$=JK(255,199,199),j=JK(207,34,46);if(Y)return{addLine:JK(219,237,255),addWord:JK(179,217,255),addDecoration:JK(36,87,138),deleteLine:w,deleteWord:$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK};return{addLine:JK(220,255,220),addWord:JK(178,255,178),addDecoration:JK(36,138,61),deleteLine:w,deleteWord:$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK}}`,
  )

  if (
    patchedSource === source ||
    !patchedSource.includes(PATCH_DIFF_THEME_PALETTE_GLOBAL)
  ) {
    throw new Error('Failed to patch diff palette for Hippocode themes.')
  }

  return patchedSource
}

function patchClaudeSource(source: string, installedAt: string): string {
  let patchedSource = patchThemeRegistry(source, installedAt)
  patchedSource = patchThemeResolver(patchedSource)
  patchedSource = patchThemePickerOptions(patchedSource)
  patchedSource = patchSyntaxThemeName(patchedSource)
  patchedSource = patchDiffThemePalette(patchedSource)
  patchedSource = patchStartupMascot(patchedSource)
  patchedSource = patchLogoThemeRefresh(patchedSource)
  patchedSource = patchThemeCommandResult(patchedSource)

  if (!isPatchedSource(patchedSource)) {
    throw new Error('Patch marker was not injected into Claude Code.')
  }

  if (
    !patchedSource.includes(PATCH_THEME_GLOBAL) ||
    !patchedSource.includes(PATCH_THEME_PICKER_OPTIONS_GLOBAL) ||
    !patchedSource.includes(PATCH_MASCOT_RENDERER_GLOBAL) ||
    !patchedSource.includes(PATCH_DIFF_THEME_PALETTE_GLOBAL) ||
    !patchedSource.includes(PATCH_SYNTAX_THEME_NAME_GLOBAL)
  ) {
    throw new Error('Claude Code patch is missing required Hippocode globals.')
  }

  return patchedSource
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
    assertValidatedClaudeVersion(targetPath, force)
    const backupPath = backupTargetFile(targetPath)
    const installedAt = new Date().toISOString()
    const patchedSource = patchClaudeSource(source, installedAt)

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
      claudeVersion: getClaudeVersionForTarget(targetPath),
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
    case 'install':
      if (value) {
        assertSupportedTheme(value)
      }
      commandInstall(resolveClaudeTargetPath(targetOverride), value, force)
      return
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
