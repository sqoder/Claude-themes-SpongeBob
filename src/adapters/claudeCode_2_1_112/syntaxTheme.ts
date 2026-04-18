import type { ClaudeCodePatchStep } from '../../claudeCodeAdapter.js'
import { PATCH_SYNTAX_THEME_NAME_GLOBAL } from '../../patchRuntime.js'

const SYNTAX_THEME_NAME_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{if\(q\.includes\("ansi"\)\)return"ansi";if\(q\.includes\("dark"\)\)return"Monokai Extended";return"GitHub"\}/

export const patchSyntaxThemeName: ClaudeCodePatchStep = source => {
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
