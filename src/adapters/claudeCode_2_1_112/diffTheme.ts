import type { ClaudeCodePatchStep } from '../../claudeCodeAdapter.js'
import { PATCH_DIFF_THEME_PALETTE_GLOBAL } from '../../patchRuntime.js'

const DIFF_THEME_PALETTE_PATTERN =
  /function ([A-Za-z0-9_$]+)\(q,K\)\{let _=q\.includes\("dark"\),z=q\.includes\("ansi"\),Y=q\.includes\("daltonized"\),A=K==="truecolor";if\(z\)return\{addLine:Ae,addWord:Ae,addDecoration:H0\(10\),deleteLine:Ae,deleteWord:Ae,deleteDecoration:H0\(9\),foreground:H0\(7\),background:Ae,scopes:S9Y\};if\(_\)\{let H=JK\(248,248,242\),J=JK\(61,1,0\),X=JK\(92,2,0\),M=JK\(220,90,90\);if\(Y\)return\{addLine:A\?JK\(0,27,41\):H0\(17\),addWord:A\?JK\(0,48,71\):H0\(24\),addDecoration:JK\(81,160,200\),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK\};return\{addLine:A\?JK\(2,40,0\):H0\(22\),addWord:A\?JK\(4,71,0\):H0\(28\),addDecoration:JK\(80,200,80\),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK\}\}let O=JK\(51,51,51\),w=JK\(255,220,220\),\$=JK\(255,199,199\),j=JK\(207,34,46\);if\(Y\)return\{addLine:JK\(219,237,255\),addWord:JK\(179,217,255\),addDecoration:JK\(36,87,138\),deleteLine:w,deleteWord:\$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK\};return\{addLine:JK\(220,255,220\),addWord:JK\(178,255,178\),addDecoration:JK\(36,138,61\),deleteLine:w,deleteWord:\$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK\}\}/

export const patchDiffThemePalette: ClaudeCodePatchStep = source => {
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
