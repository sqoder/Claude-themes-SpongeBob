import type { ClaudeCodePatchStep } from '../../claudeCodeAdapter.js'
import {
  PATCH_ACTIVE_THEME_GLOBAL,
  PATCH_MASCOT_RENDERER_GLOBAL,
} from '../../patchRuntime.js'

const STARTUP_MASCOT_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q\)\{let K=s\(26\),_;if\(K\[0\]!==q\)_=q===void 0\?\{\}:q,K\[0\]=q,K\[1\]=_;else _=K\[1\];let\{pose:z\}=_,Y=z===void 0\?"default":z;/
const LOGO_V2_PATTERN =
  /function ([A-Za-z0-9_$]+)\(\)\{let q=s\(94\),K=wdK\(\),_=H8\(\)\.oauthAccount\?\.displayName\?\?"",\{columns:z\}=s1\(\),Y;/
const LOGO_THEME_COLOR_PATTERN = /let A6=zdK\(z\),e=Ad\(H8\(\)\.theme\),i=/
const LOGO_COMPACT_MASCOT_PATTERN =
  /let w6;if\(q\[37\]===Symbol\.for\("react\.memo_cache_sentinel"\)\)w6=V7\.createElement\(u,\{marginY:1\},V7\.createElement\(sP6,null\)\),q\[37\]=w6;else w6=q\[37\];/
const LOGO_FULL_MASCOT_PATTERN =
  /let y6;if\(q\[50\]===Symbol\.for\("react\.memo_cache_sentinel"\)\)y6=V7\.createElement\(sP6,null\),q\[50\]=y6;else y6=q\[50\];/

export const patchStartupMascot: ClaudeCodePatchStep = source => {
  const patchedSource = source.replace(
    STARTUP_MASCOT_PATTERN,
    `function $1(q){let K=s(26),_;if(K[0]!==q)_=q===void 0?{}:q,K[0]=q,K[1]=_;else _=K[1];let __hippocodeThemeTuple=typeof Zq==="function"?Zq():null,{pose:z}=_,Y=z===void 0?"default":z,__hippocodeTheme=Array.isArray(__hippocodeThemeTuple)&&typeof __hippocodeThemeTuple[0]==="string"?__hippocodeThemeTuple[0]:typeof globalThis.${PATCH_ACTIVE_THEME_GLOBAL}==="string"?globalThis.${PATCH_ACTIVE_THEME_GLOBAL}:typeof H8==="function"?H8().theme:void 0;let __hippocodeMascot=globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}?globalThis.${PATCH_MASCOT_RENDERER_GLOBAL}(cz,u,T,__hippocodeTheme,Y):null;if(__hippocodeMascot)return __hippocodeMascot;`,
  )

  if (patchedSource === source) {
    throw new Error('Failed to patch Claude Code startup mascot.')
  }

  return patchedSource
}

export const patchLogoThemeRefresh: ClaudeCodePatchStep = source => {
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
