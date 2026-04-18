import { buildThemePickerOptions } from '../../themeFactory.js'

import type { ClaudeCodePatchStep } from '../../claudeCodeAdapter.js'
import {
  PATCH_ACTIVE_THEME_GLOBAL,
  PATCH_THEME_COMMAND_RESTART_HINT,
  PATCH_THEME_GLOBAL,
  PATCH_THEME_PICKER_OPTIONS_GLOBAL,
} from '../../patchRuntime.js'

const THEME_PICKER_PATTERN =
  /S=\[\{label:"Auto \(match terminal\)",value:"auto"\},\{label:"Dark mode",value:"dark"\},\{label:"Light mode",value:"light"\},\{label:"Dark mode \(colorblind-friendly\)",value:"dark-daltonized"\},\{label:"Light mode \(colorblind-friendly\)",value:"light-daltonized"\},\{label:"Dark mode \(ANSI colors only\)",value:"dark-ansi"\},\{label:"Light mode \(ANSI colors only\)",value:"light-ansi"\}\],K\[(\d+)\]=S;/
const THEME_PICKER_VISIBLE_OPTION_COUNT_PATTERN =
  /visibleOptionCount:F\.length/g
const THEME_COMMAND_RESULT_PATTERN =
  /Y=\(w\)=>\{z\(w\),_\(`Theme set to \$\{w\}`\)\}/

export const patchThemePickerOptions: ClaudeCodePatchStep = source => {
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

export const patchThemeCommandResult: ClaudeCodePatchStep = source => {
  const patchedSource = source.replace(
    THEME_COMMAND_RESULT_PATTERN,
    `Y=(w)=>{globalThis.${PATCH_ACTIVE_THEME_GLOBAL}=w,z(w),globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[w]?_(\`Theme set to \${w}. ${PATCH_THEME_COMMAND_RESTART_HINT}\`):_(\`Theme set to \${w}\`)}`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to patch /theme completion message for Pixel themes.')
  }

  return patchedSource
}
