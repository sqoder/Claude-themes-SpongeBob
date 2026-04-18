#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packageDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const cliPath = join(packageDir, 'dist', 'cli.js')
const tempRoot = mkdtempSync(join(tmpdir(), 'hippocode-theme-patcher-smoke-'))

function buildFixtureSource(version = '2.1.112 (Claude Code)') {
  return `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log(${JSON.stringify(version)})
  process.exit(0)
}
function s(){return []}
function wdK(){return null}
function H8(){return {theme:"dark",oauthAccount:{displayName:"Fixture"}}}
function s1(){return {columns:80}}
function zdK(){return "compact"}
function Ad(){return {}}
function Zq(){return ["dark"]}
const V7={createElement(){return null}}
const u=function(){}
const T=function(){}
const cz={createElement(){return null}}
const JK=(r,g,b)=>\`rgb(\${r},\${g},\${b})\`
const H0=(n)=>\`ansi-\${n}\`
const Ae="transparent"
const uMK={}
const mMK={}
const S9Y={}
let A,B,S,Y,F
let K=[]
A=["dark","light","light-daltonized","dark-daltonized","light-ansi","dark-ansi"],B=["auto",...A],
function t(q){switch(q){case"light":return {};case"dark":return {};default:return {}}}
S=[{label:"Auto (match terminal)",value:"auto"},{label:"Dark mode",value:"dark"},{label:"Light mode",value:"light"},{label:"Dark mode (colorblind-friendly)",value:"dark-daltonized"},{label:"Light mode (colorblind-friendly)",value:"light-daltonized"},{label:"Dark mode (ANSI colors only)",value:"dark-ansi"},{label:"Light mode (ANSI colors only)",value:"light-ansi"}],K[3]=S;
F=S;let picker={visibleOptionCount:F.length}
function sP6(q){let K=s(26),_;if(K[0]!==q)_=q===void 0?{}:q,K[0]=q,K[1]=_;else _=K[1];let{pose:z}=_,Y=z===void 0?"default":z;return Y}
function logo(){let q=s(94),K=wdK(),_=H8().oauthAccount?.displayName??"",{columns:z}=s1(),Y;let A6=zdK(z),e=Ad(H8().theme),i=0;let w6;if(q[37]===Symbol.for("react.memo_cache_sentinel"))w6=V7.createElement(u,{marginY:1},V7.createElement(sP6,null)),q[37]=w6;else w6=q[37];let y6;if(q[50]===Symbol.for("react.memo_cache_sentinel"))y6=V7.createElement(sP6,null),q[50]=y6;else y6=q[50];return i}
let z=(w)=>w,_=(message)=>message
Y=(w)=>{z(w),_(\`Theme set to \${w}\`)}
function h9Y(q){if(q.includes("ansi"))return"ansi";if(q.includes("dark"))return"Monokai Extended";return"GitHub"}
function QMK(q,K){let _=q.includes("dark"),z=q.includes("ansi"),Y=q.includes("daltonized"),A=K==="truecolor";if(z)return{addLine:Ae,addWord:Ae,addDecoration:H0(10),deleteLine:Ae,deleteWord:Ae,deleteDecoration:H0(9),foreground:H0(7),background:Ae,scopes:S9Y};if(_){let H=JK(248,248,242),J=JK(61,1,0),X=JK(92,2,0),M=JK(220,90,90);if(Y)return{addLine:A?JK(0,27,41):H0(17),addWord:A?JK(0,48,71):H0(24),addDecoration:JK(81,160,200),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK};return{addLine:A?JK(2,40,0):H0(22),addWord:A?JK(4,71,0):H0(28),addDecoration:JK(80,200,80),deleteLine:J,deleteWord:X,deleteDecoration:M,foreground:H,background:Ae,scopes:uMK}}let O=JK(51,51,51),w=JK(255,220,220),$=JK(255,199,199),j=JK(207,34,46);if(Y)return{addLine:JK(219,237,255),addWord:JK(179,217,255),addDecoration:JK(36,87,138),deleteLine:w,deleteWord:$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK};return{addLine:JK(220,255,220),addWord:JK(178,255,178),addDecoration:JK(36,138,61),deleteLine:w,deleteWord:$,deleteDecoration:j,foreground:O,background:Ae,scopes:mMK}}
console.log("fixture")
`
}

function runCli(args, homeDir) {
  const result = spawnSync('node', [cliPath, ...args], {
    cwd: packageDir,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

  if (result.status !== 0) {
    throw new Error(output)
  }

  return output
}

function writeFixture(homeDir, name, version) {
  const targetPath = join(tempRoot, `${name}.cli.js`)
  writeFileSync(targetPath, buildFixtureSource(version), 'utf8')
  return targetPath
}

function writeCustomThemePack(path, accent, shimmer, promptBorder) {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        themes: [
          {
            name: 'jellyfish-fields',
            displayName: 'Jellyfish Fields',
            accent,
            shimmer,
            promptBorder,
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

try {
  const validatedHomeDir = join(tempRoot, 'validated-home')
  const unsupportedHomeDir = join(tempRoot, 'unsupported-home')
  const customThemePackPath = join(tempRoot, 'jellyfish-pack.json')
  const validatedTarget = writeFixture(
    validatedHomeDir,
    'validated',
    '2.1.112 (Claude Code)',
  )
  const unsupportedTarget = writeFixture(
    unsupportedHomeDir,
    'unsupported',
    '2.1.999 (Claude Code)',
  )
  const originalValidatedSource = readFileSync(validatedTarget, 'utf8')

  writeCustomThemePack(
    customThemePackPath,
    '#b982ff',
    '#e9d5ff',
    '#7d5fa8',
  )

  const installOutput = runCli(
    ['--target', validatedTarget, 'install', 'spongebob'],
    validatedHomeDir,
  )
  assert.match(installOutput, /Installed Hippocode theme patch/)
  assert.match(installOutput, /Claude Code theme set: unset -> spongebob/)
  assert.equal(
    JSON.parse(readFileSync(join(validatedHomeDir, '.claude.json'), 'utf8')).theme,
    'spongebob',
  )

  const statusOutput = runCli(
    ['--target', validatedTarget, 'status'],
    validatedHomeDir,
  )
  assert.match(statusOutput, /patch: installed/)
  assert.match(statusOutput, /theme: spongebob/)
  assert.match(statusOutput, /customThemes: 0 imported/)
  assert.match(statusOutput, /validated: yes \(2\.1\.112\)/)

  const setOutput = runCli(
    ['--target', validatedTarget, 'set', 'bubble-bass'],
    validatedHomeDir,
  )
  assert.match(setOutput, /Claude Code theme set: spongebob -> bubble-bass/)
  assert.equal(
    JSON.parse(readFileSync(join(validatedHomeDir, '.claude.json'), 'utf8')).theme,
    'bubble-bass',
  )

  const importOutput = runCli(
    ['--target', validatedTarget, 'import-theme', customThemePackPath],
    validatedHomeDir,
  )
  assert.match(importOutput, /Imported 1 custom theme seed/)
  assert.match(importOutput, /Embedded imported custom themes/)
  assert.match(readFileSync(validatedTarget, 'utf8'), /jellyfish-fields/)

  const listOutput = runCli(['list'], validatedHomeDir)
  assert.match(listOutput, /Imported custom themes:/)
  assert.match(listOutput, /jellyfish-fields/)
  assert.match(listOutput, /light-jellyfish-fields/)

  const customSetOutput = runCli(
    ['--target', validatedTarget, 'set', 'light-jellyfish-fields'],
    validatedHomeDir,
  )
  assert.match(
    customSetOutput,
    /Claude Code theme set: bubble-bass -> light-jellyfish-fields/,
  )
  assert.equal(
    JSON.parse(readFileSync(join(validatedHomeDir, '.claude.json'), 'utf8')).theme,
    'light-jellyfish-fields',
  )

  writeCustomThemePack(
    customThemePackPath,
    '#1234ab',
    '#6b84d6',
    '#3450a8',
  )

  const reimportOutput = runCli(
    ['--target', validatedTarget, 'import-theme', customThemePackPath],
    validatedHomeDir,
  )
  assert.match(reimportOutput, /Refreshed Hippocode theme patch/)
  assert.match(readFileSync(validatedTarget, 'utf8'), /rgb\(18,52,171\)/)
  assert.doesNotMatch(readFileSync(validatedTarget, 'utf8'), /rgb\(185,130,255\)/)

  let unsupportedError = ''
  try {
    runCli(
      ['--target', unsupportedTarget, 'install', 'spongebob'],
      unsupportedHomeDir,
    )
  } catch (error) {
    unsupportedError = error instanceof Error ? error.message : String(error)
  }
  assert.match(unsupportedError, /has not been validated/)
  assert.match(unsupportedError, /--force/)

  const forcedInstallOutput = runCli(
    ['--target', unsupportedTarget, '--force', 'install', 'spongebob'],
    unsupportedHomeDir,
  )
  assert.match(forcedInstallOutput, /Proceeding because --force was provided/)

  const removeOutput = runCli(
    ['--target', validatedTarget, 'remove'],
    validatedHomeDir,
  )
  assert.match(removeOutput, /Restored official Claude Code/)
  assert.equal(readFileSync(validatedTarget, 'utf8'), originalValidatedSource)
  assert.equal(
    readFileSync(validatedTarget, 'utf8').includes('__HIPPOCODE_THEME_PATCH__'),
    false,
  )

  console.log('claude-code-theme-patcher smoke test passed')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
