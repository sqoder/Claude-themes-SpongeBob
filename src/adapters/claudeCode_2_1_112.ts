import type {
  ClaudeCodeAdapter,
  ClaudeCodePatchStep,
} from '../claudeCodeAdapter.js'

import { patchDiffThemePalette } from './claudeCode_2_1_112/diffTheme.js'
import {
  patchLogoThemeRefresh,
  patchStartupMascot,
} from './claudeCode_2_1_112/mascot.js'
import {
  patchThemeCommandResult,
  patchThemePickerOptions,
} from './claudeCode_2_1_112/themePicker.js'
import {
  patchThemeRegistry,
  patchThemeResolver,
} from './claudeCode_2_1_112/themeRegistry.js'
import { patchSyntaxThemeName } from './claudeCode_2_1_112/syntaxTheme.js'

const PATCH_STEPS = Object.freeze([
  patchThemeRegistry,
  patchThemeResolver,
  patchThemePickerOptions,
  patchSyntaxThemeName,
  patchDiffThemePalette,
  patchStartupMascot,
  patchLogoThemeRefresh,
  patchThemeCommandResult,
]) as readonly ClaudeCodePatchStep[]

export const claudeCode_2_1_112_Adapter: ClaudeCodeAdapter = {
  id: 'official-2.1.112',
  supportedVersions: ['2.1.112'],
  patch(source, context) {
    return PATCH_STEPS.reduce(
      (patchedSource, patchStep) => patchStep(patchedSource, context),
      source,
    )
  },
}
