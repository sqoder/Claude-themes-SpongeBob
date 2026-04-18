import {
  buildBuiltinPatchThemePayload,
  type PatchThemePayload,
} from './themePayload.js'

const BUILTIN_PATCH_THEME_PAYLOAD = buildBuiltinPatchThemePayload()

export const PATCHER_VERSION = '0.2.0'
export const PATCH_MARKER = '__HIPPOCODE_THEME_PATCH__'
export const PATCH_THEME_GLOBAL = '__hippocodePixelThemes'
export const PATCH_THEME_PICKER_OPTIONS_GLOBAL = '__hippocodeThemePickerOptions'
export const PATCH_PIXEL_SPRITES_GLOBAL = '__hippocodePixelSprites'
export const PATCH_PIXEL_POSES_GLOBAL = '__hippocodePixelStartupPoses'
export const PATCH_MASCOT_RENDERER_GLOBAL = '__hippocodeRenderPixelMascot'
export const PATCH_ACTIVE_THEME_GLOBAL = '__hippocodeActiveTheme'
export const PATCH_DIFF_THEME_PALETTE_GLOBAL = '__hippocodeBuildDiffThemePalette'
export const PATCH_SYNTAX_THEME_NAME_GLOBAL = '__hippocodeGetSyntaxThemeName'
export const PATCH_THEME_COMMAND_RESTART_HINT =
  'Restart Claude Code to refresh the startup pixel showcase.'

export function hasCurrentPatchFeatures(source: string): boolean {
  return (
    source.includes(PATCH_MARKER) &&
    source.includes(`"version":"${PATCHER_VERSION}"`) &&
    source.includes(PATCH_THEME_PICKER_OPTIONS_GLOBAL) &&
    source.includes(PATCH_MASCOT_RENDERER_GLOBAL) &&
    source.includes(PATCH_DIFF_THEME_PALETTE_GLOBAL) &&
    source.includes(PATCH_SYNTAX_THEME_NAME_GLOBAL) &&
    source.includes(PATCH_THEME_COMMAND_RESTART_HINT)
  )
}

export function buildSupportedThemeList(
  existingThemes: string[],
  managedThemeNames = BUILTIN_PATCH_THEME_PAYLOAD.themeNames,
): string[] {
  return [
    ...new Set([...existingThemes, ...managedThemeNames]),
  ]
}

function buildPixelMascotRendererSource(): string {
  return `function(__hippocodeReact,__hippocodeBox,__hippocodeText,__hippocodeTheme,__hippocodePose){var __hippocodeThemes=globalThis.${PATCH_THEME_GLOBAL};if(!__hippocodeThemes||typeof __hippocodeTheme!=="string"||!__hippocodeThemes[__hippocodeTheme])return null;var __hippocodeBase=__hippocodeTheme.replace(/^light-/,"");var __hippocodePoses=globalThis.${PATCH_PIXEL_POSES_GLOBAL}||{};var __hippocodeSprites=globalThis.${PATCH_PIXEL_SPRITES_GLOBAL}||{};var __hippocodeRows=(__hippocodePoses[__hippocodeBase]&&__hippocodePoses[__hippocodeBase][__hippocodePose])||(__hippocodePoses[__hippocodeBase]&&__hippocodePoses[__hippocodeBase].default)||__hippocodeSprites[__hippocodeBase];if(!Array.isArray(__hippocodeRows)||__hippocodeRows.length===0)return null;var __hippocodeGlyphs=[" ","▘","▝","▀","▖","▌","▞","▛","▗","▚","▐","▜","▄","▙","▟","█"];var __hippocodeColor=__hippocodeThemes[__hippocodeTheme].clawd_body;var __hippocodeWidth=0;for(var __hippocodeWidthIndex=0;__hippocodeWidthIndex<__hippocodeRows.length;__hippocodeWidthIndex+=1){var __hippocodeCandidate=__hippocodeRows[__hippocodeWidthIndex];if(typeof __hippocodeCandidate==="string"&&__hippocodeCandidate.length>__hippocodeWidth)__hippocodeWidth=__hippocodeCandidate.length}if(__hippocodeWidth===0)return null;var __hippocodeLines=[];for(var __hippocodeRowIndex=0;__hippocodeRowIndex<__hippocodeRows.length;__hippocodeRowIndex+=2){var __hippocodeTop=__hippocodeRows[__hippocodeRowIndex]||"";var __hippocodeBottom=__hippocodeRows[__hippocodeRowIndex+1]||"";var __hippocodeCells=[];for(var __hippocodeColumnIndex=0;__hippocodeColumnIndex<__hippocodeWidth;__hippocodeColumnIndex+=2){var __hippocodeTopLeft=(__hippocodeTop[__hippocodeColumnIndex]||".")!==".";var __hippocodeTopRight=(__hippocodeTop[__hippocodeColumnIndex+1]||".")!==".";var __hippocodeBottomLeft=(__hippocodeBottom[__hippocodeColumnIndex]||".")!==".";var __hippocodeBottomRight=(__hippocodeBottom[__hippocodeColumnIndex+1]||".")!==".";var __hippocodeMask=(__hippocodeTopLeft?1:0)|(__hippocodeTopRight?2:0)|(__hippocodeBottomLeft?4:0)|(__hippocodeBottomRight?8:0);var __hippocodeGlyph=__hippocodeGlyphs[__hippocodeMask]||" ";if(__hippocodeMask===0){__hippocodeCells.push(__hippocodeReact.createElement(__hippocodeText,{key:"c"+__hippocodeRowIndex+"-"+__hippocodeColumnIndex}," "));continue}__hippocodeCells.push(__hippocodeReact.createElement(__hippocodeText,{key:"c"+__hippocodeRowIndex+"-"+__hippocodeColumnIndex,color:__hippocodeColor},__hippocodeGlyph))}__hippocodeLines.push(__hippocodeReact.createElement(__hippocodeText,{key:"r"+__hippocodeRowIndex},__hippocodeCells))}return __hippocodeReact.createElement(__hippocodeBox,{flexDirection:"column"},__hippocodeLines)}`
}

function buildDiffThemePaletteSource(): string {
  return `function(__hippocodeThemeName,__hippocodeColorMode,__hippocodeRgb,__hippocodeAnsi,__hippocodeTransparent,__hippocodeDarkScopes,__hippocodeLightScopes,__hippocodeAnsiScopes){var __hippocodeThemes=globalThis.${PATCH_THEME_GLOBAL};var __hippocodeTheme=__hippocodeThemes&&__hippocodeThemes[__hippocodeThemeName];if(!__hippocodeTheme)return null;var __hippocodeParse=function(__hippocodeValue,__hippocodeFallback){if(typeof __hippocodeValue!=="string")return __hippocodeFallback;var __hippocodeMatch=__hippocodeValue.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);if(!__hippocodeMatch)return __hippocodeFallback;return __hippocodeRgb(Number.parseInt(__hippocodeMatch[1],10),Number.parseInt(__hippocodeMatch[2],10),Number.parseInt(__hippocodeMatch[3],10));};var __hippocodeDark=__hippocodeThemeName.includes("dark");var __hippocodeScopes=Object.assign({},__hippocodeDark?__hippocodeDarkScopes:__hippocodeLightScopes);var __hippocodeSetScope=function(__hippocodeKey,__hippocodeValue){if(typeof __hippocodeValue==="string")__hippocodeScopes[__hippocodeKey]=__hippocodeParse(__hippocodeValue,__hippocodeScopes[__hippocodeKey]);};__hippocodeSetScope("keyword",__hippocodeTheme.syntaxKeyword);__hippocodeSetScope("_storage",__hippocodeTheme.syntaxStorage||__hippocodeTheme.syntaxKeyword);__hippocodeSetScope("built_in",__hippocodeTheme.syntaxBuiltIn);__hippocodeSetScope("type",__hippocodeTheme.syntaxType);__hippocodeSetScope("literal",__hippocodeTheme.syntaxLiteral);__hippocodeSetScope("number",__hippocodeTheme.syntaxNumber);__hippocodeSetScope("string",__hippocodeTheme.syntaxString);__hippocodeSetScope("title",__hippocodeTheme.syntaxTitle);__hippocodeSetScope("params",__hippocodeTheme.syntaxParams);__hippocodeSetScope("comment",__hippocodeTheme.syntaxComment);__hippocodeSetScope("meta",__hippocodeTheme.syntaxMeta);__hippocodeSetScope("attr",__hippocodeTheme.syntaxAttr);__hippocodeSetScope("attribute",__hippocodeTheme.syntaxAttribute);__hippocodeSetScope("variable",__hippocodeTheme.syntaxVariable);__hippocodeSetScope("variable.language",__hippocodeTheme.syntaxVariableLanguage);__hippocodeSetScope("property",__hippocodeTheme.syntaxProperty);__hippocodeSetScope("operator",__hippocodeTheme.syntaxOperator);__hippocodeSetScope("punctuation",__hippocodeTheme.syntaxPunctuation);__hippocodeSetScope("symbol",__hippocodeTheme.syntaxSymbol);__hippocodeSetScope("regexp",__hippocodeTheme.syntaxRegexp);__hippocodeSetScope("subst",__hippocodeTheme.syntaxSubst);return{addLine:__hippocodeParse(__hippocodeTheme.diffAddedDimmed||__hippocodeTheme.diffAdded,__hippocodeDark?__hippocodeRgb(2,40,0):__hippocodeRgb(220,255,220)),addWord:__hippocodeParse(__hippocodeTheme.diffAdded||__hippocodeTheme.diffAddedWord,__hippocodeDark?__hippocodeRgb(4,71,0):__hippocodeRgb(178,255,178)),addDecoration:__hippocodeParse(__hippocodeTheme.diffAddedWord||__hippocodeTheme.claude,__hippocodeDark?__hippocodeRgb(80,200,80):__hippocodeRgb(36,138,61)),deleteLine:__hippocodeParse(__hippocodeTheme.diffRemovedDimmed||__hippocodeTheme.diffRemoved,__hippocodeDark?__hippocodeRgb(61,1,0):__hippocodeRgb(255,220,220)),deleteWord:__hippocodeParse(__hippocodeTheme.diffRemoved||__hippocodeTheme.diffRemovedWord,__hippocodeDark?__hippocodeRgb(92,2,0):__hippocodeRgb(255,199,199)),deleteDecoration:__hippocodeParse(__hippocodeTheme.diffRemovedWord||__hippocodeTheme.error,__hippocodeDark?__hippocodeRgb(220,90,90):__hippocodeRgb(207,34,46)),foreground:__hippocodeParse(__hippocodeTheme.text,__hippocodeDark?__hippocodeRgb(248,248,242):__hippocodeRgb(51,51,51)),background:__hippocodeTransparent,scopes:__hippocodeScopes}}`
}

function buildSyntaxThemeNameSource(): string {
  return `function(__hippocodeThemeName){var __hippocodeOptions=globalThis.${PATCH_THEME_PICKER_OPTIONS_GLOBAL};if(Array.isArray(__hippocodeOptions)){for(var __hippocodeIndex=0;__hippocodeIndex<__hippocodeOptions.length;__hippocodeIndex+=1){var __hippocodeOption=__hippocodeOptions[__hippocodeIndex];if(__hippocodeOption&&__hippocodeOption.value===__hippocodeThemeName&&typeof __hippocodeOption.label==="string")return __hippocodeOption.label.replace(/\\s+(?:pixel|custom) theme$/i,"")}}return null}`
}

export function buildPatchAssignments(
  installedAt: string,
  themePayload: PatchThemePayload = BUILTIN_PATCH_THEME_PAYLOAD,
): string {
  const patchInfo = {
    patcher: 'claude-code-theme-patcher',
    version: PATCHER_VERSION,
    installedAt,
    themeCount: themePayload.themeNames.length,
    pixelThemeCount: BUILTIN_PATCH_THEME_PAYLOAD.themeNames.length,
    customThemeCount: themePayload.customThemeCount,
  }

  return [
    `globalThis.${PATCH_MARKER}=${JSON.stringify(patchInfo)}`,
    `globalThis.${PATCH_THEME_GLOBAL}=${JSON.stringify(themePayload.themes)}`,
    `globalThis.${PATCH_THEME_PICKER_OPTIONS_GLOBAL}=${JSON.stringify(themePayload.pickerOptions)}`,
    `globalThis.${PATCH_PIXEL_SPRITES_GLOBAL}=${JSON.stringify(themePayload.sprites)}`,
    `globalThis.${PATCH_PIXEL_POSES_GLOBAL}=${JSON.stringify(themePayload.poses)}`,
    `globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}=${buildPixelMascotRendererSource()}`,
    `globalThis.${PATCH_DIFF_THEME_PALETTE_GLOBAL}=${buildDiffThemePaletteSource()}`,
    `globalThis.${PATCH_SYNTAX_THEME_NAME_GLOBAL}=${buildSyntaxThemeNameSource()}`,
    `globalThis.${PATCH_ACTIVE_THEME_GLOBAL}=typeof globalThis.${PATCH_ACTIVE_THEME_GLOBAL}==="string"?globalThis.${PATCH_ACTIVE_THEME_GLOBAL}:void 0`,
  ].join(',') + ','
}
