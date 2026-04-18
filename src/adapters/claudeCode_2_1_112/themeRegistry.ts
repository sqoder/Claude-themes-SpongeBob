import type { ClaudeCodePatchStep } from '../../claudeCodeAdapter.js'
import {
  PATCH_THEME_GLOBAL,
  buildPatchAssignments,
  buildSupportedThemeList,
} from '../../patchRuntime.js'

const THEME_LIST_PATTERN =
  /([A-Za-z0-9_$]+)=\["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"\],([A-Za-z0-9_$]+)=\["auto",\.\.\.\1\],/s
const THEME_RESOLVER_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{switch\(q\)\{case"light":return/

export const patchThemeRegistry: ClaudeCodePatchStep = (source, context) => {
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
  const nextThemeList = `$1=${JSON.stringify(extendedThemes)},$2=["auto",...$1],${buildPatchAssignments(context.installedAt)}`
  const patchedSource = source.replace(THEME_LIST_PATTERN, nextThemeList)

  if (patchedSource === source) {
    throw new Error('Failed to extend Claude Code theme option list.')
  }

  return patchedSource
}

export const patchThemeResolver: ClaudeCodePatchStep = source => {
  const resolverGuard = `if(globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[q])return globalThis.${PATCH_THEME_GLOBAL}[q];`
  const nextResolver = `function $1(q){if(globalThis.${PATCH_THEME_GLOBAL}&&globalThis.${PATCH_THEME_GLOBAL}[q])return globalThis.${PATCH_THEME_GLOBAL}[q];switch(q){case"light":return`
  const patchedSource = source.replace(THEME_RESOLVER_PATTERN, nextResolver)

  if (patchedSource === source || !patchedSource.includes(resolverGuard)) {
    throw new Error('Failed to inject Hippocode Pixel theme resolver.')
  }

  return patchedSource
}
