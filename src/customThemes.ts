import { createCharacterTheme, type ThemePickerOption } from './themeFactory.js'
import type { PatchThemePayload } from './themePayload.js'

export const CUSTOM_THEME_PACK_VERSION = 1

export type ImportedCustomTheme = {
  name: string
  displayName?: string
  accent: string
  shimmer?: string
  promptBorder?: string
}

export type ImportedCustomThemePack = {
  themes?: ImportedCustomTheme[]
}

export type StoredCustomTheme = {
  name: string
  displayName: string
  accent: string
  shimmer: string
  promptBorder: string
}

export type StoredCustomThemePack = {
  version: number
  themes: StoredCustomTheme[]
}

const COLOR_FORMAT_HELP =
  'must be a color string like "#fdd835" or "rgb(253,216,53)".'

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`)
  }
}

function normalizeThemeName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error('Custom theme name must be a string.')
  }

  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (normalized === '') {
    throw new Error('Custom theme name cannot be empty.')
  }

  if (normalized.startsWith('light-')) {
    throw new Error(
      `Custom theme "${name}" cannot start with "light-"; the light variant is generated automatically.`,
    )
  }

  return normalized
}

function normalizeDisplayName(
  name: string,
  displayName: unknown,
): string {
  if (typeof displayName === 'string' && displayName.trim() !== '') {
    return displayName.trim()
  }

  return name
    .split('-')
    .map(part => part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeHexColor(match: RegExpMatchArray): string {
  const [, shortHex, fullHex] = match
  const value =
    shortHex !== undefined
      ? shortHex
          .split('')
          .map(digit => `${digit}${digit}`)
          .join('')
      : fullHex!

  return `rgb(${Number.parseInt(value.slice(0, 2), 16)},${Number.parseInt(value.slice(2, 4), 16)},${Number.parseInt(value.slice(4, 6), 16)})`
}

function normalizeRgbColor(match: RegExpMatchArray): string {
  const red = Number.parseInt(match[1]!, 10)
  const green = Number.parseInt(match[2]!, 10)
  const blue = Number.parseInt(match[3]!, 10)

  for (const [channel, value] of [
    ['red', red],
    ['green', green],
    ['blue', blue],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(
        `Custom theme ${channel} channel must be an integer between 0 and 255.`,
      )
    }
  }

  return `rgb(${red},${green},${blue})`
}

function normalizeColor(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} ${COLOR_FORMAT_HELP}`)
  }

  const trimmed = value.trim()
  const hexMatch = trimmed.match(/^#(?:([0-9a-fA-F]{3})|([0-9a-fA-F]{6}))$/)
  if (hexMatch) {
    return normalizeHexColor(hexMatch)
  }

  const rgbMatch = trimmed.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
  )
  if (rgbMatch) {
    return normalizeRgbColor(rgbMatch)
  }

  throw new Error(
    `${label} ${COLOR_FORMAT_HELP}`,
  )
}

function normalizeImportedTheme(
  value: unknown,
  reservedThemeNames: Set<string>,
): StoredCustomTheme {
  assertObject(value, 'Each custom theme entry')

  const name = normalizeThemeName(value.name)
  const lightName = `light-${name}`

  if (reservedThemeNames.has(name) || reservedThemeNames.has(lightName)) {
    throw new Error(
      `Custom theme "${name}" conflicts with an existing official, bundled, or already imported theme.`,
    )
  }

  reservedThemeNames.add(name)
  reservedThemeNames.add(lightName)

  const accent = normalizeColor(value.accent, `Custom theme "${name}" accent`)
  const shimmer = normalizeColor(
    value.shimmer ?? value.accent,
    `Custom theme "${name}" shimmer`,
  )
  const promptBorder = normalizeColor(
    value.promptBorder ?? value.accent,
    `Custom theme "${name}" promptBorder`,
  )

  return {
    name,
    displayName: normalizeDisplayName(name, value.displayName),
    accent,
    shimmer,
    promptBorder,
  }
}

function buildCustomThemePickerOptions(
  themes: readonly StoredCustomTheme[],
): ThemePickerOption[] {
  return themes.flatMap<ThemePickerOption>(theme => [
    {
      label: `${theme.displayName} custom theme`,
      value: theme.name,
    },
    {
      label: `Light ${theme.displayName} custom theme`,
      value: `light-${theme.name}`,
    },
  ])
}

export function createEmptyCustomThemePack(): StoredCustomThemePack {
  return {
    version: CUSTOM_THEME_PACK_VERSION,
    themes: [],
  }
}

export function normalizeCustomThemePack(
  value: unknown,
  reservedThemeNames: readonly string[],
): StoredCustomThemePack {
  if (value === null || value === undefined) {
    return createEmptyCustomThemePack()
  }

  assertObject(value, 'Custom theme pack')

  const themesValue = value.themes ?? []
  if (!Array.isArray(themesValue)) {
    throw new Error('Custom theme pack "themes" must be an array.')
  }

  const reservedNames = new Set(reservedThemeNames)
  const themes = themesValue.map(theme =>
    normalizeImportedTheme(theme, reservedNames),
  )

  return {
    version: CUSTOM_THEME_PACK_VERSION,
    themes,
  }
}

export function mergeCustomThemePacks(
  base: StoredCustomThemePack,
  incoming: StoredCustomThemePack,
): StoredCustomThemePack {
  const merged = new Map<string, StoredCustomTheme>()

  for (const theme of base.themes) {
    merged.set(theme.name, theme)
  }

  for (const theme of incoming.themes) {
    merged.set(theme.name, theme)
  }

  return {
    version: CUSTOM_THEME_PACK_VERSION,
    themes: [...merged.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  }
}

export function listCustomThemeNames(
  themePack: StoredCustomThemePack,
): string[] {
  return themePack.themes.flatMap(theme => [
    theme.name,
    `light-${theme.name}`,
  ])
}

export function buildCustomThemePayload(
  themePack: StoredCustomThemePack,
): PatchThemePayload {
  const themes = Object.fromEntries(
    themePack.themes.flatMap(theme => [
      [
        theme.name,
        createCharacterTheme(
          theme.accent,
          theme.shimmer,
          theme.promptBorder,
          false,
        ),
      ],
      [
        `light-${theme.name}`,
        createCharacterTheme(
          theme.accent,
          theme.shimmer,
          theme.promptBorder,
          true,
        ),
      ],
    ]),
  )

  return {
    themes,
    pickerOptions: buildCustomThemePickerOptions(themePack.themes),
    sprites: {},
    poses: {},
    themeNames: listCustomThemeNames(themePack),
    customThemeCount: themePack.themes.length,
  }
}
