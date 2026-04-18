import type {
  PixelStartupPose,
  Theme,
  ThemePickerOption,
} from './themeFactory.js'
import {
  PIXEL_THEME_NAMES,
  buildPixelSpritePayload,
  buildPixelStartupPosePayload,
  buildPixelThemePayload,
  buildThemePickerOptions,
} from './themeFactory.js'

export type PatchThemePayload = {
  themes: Record<string, Theme>
  pickerOptions: ThemePickerOption[]
  sprites: Record<string, string[]>
  poses: Record<string, Partial<Record<PixelStartupPose, string[]>>>
  themeNames: string[]
  customThemeCount: number
}

function mergePickerOptions(
  base: readonly ThemePickerOption[],
  extra: readonly ThemePickerOption[],
): ThemePickerOption[] {
  const merged = new Map<string, ThemePickerOption>()

  for (const option of [...base, ...extra]) {
    merged.set(option.value, option)
  }

  return [...merged.values()]
}

export function buildBuiltinPatchThemePayload(): PatchThemePayload {
  return {
    themes: buildPixelThemePayload(),
    pickerOptions: buildThemePickerOptions(),
    sprites: buildPixelSpritePayload(),
    poses: buildPixelStartupPosePayload(),
    themeNames: [...PIXEL_THEME_NAMES],
    customThemeCount: 0,
  }
}

export function mergePatchThemePayloads(
  base: PatchThemePayload,
  extra?: PatchThemePayload,
): PatchThemePayload {
  if (!extra) {
    return base
  }

  return {
    themes: {
      ...base.themes,
      ...extra.themes,
    },
    pickerOptions: mergePickerOptions(base.pickerOptions, extra.pickerOptions),
    sprites: {
      ...base.sprites,
      ...extra.sprites,
    },
    poses: {
      ...base.poses,
      ...extra.poses,
    },
    themeNames: [...new Set([...base.themeNames, ...extra.themeNames])],
    customThemeCount: base.customThemeCount + extra.customThemeCount,
  }
}
