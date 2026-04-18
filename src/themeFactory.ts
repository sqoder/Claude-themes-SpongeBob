type Theme = Record<string, string>

type PixelThemeSeed = {
  name: string
  displayName: string
  accent: string
  shimmer: string
  promptBorder: string
}

type ThemePickerOption = {
  label: string
  value: string
}

type PixelStartupPose = 'default' | 'arms-up' | 'look-left' | 'look-right'

type PixelBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const PIXEL_SOURCE_WIDTH = 14
const PIXEL_SOURCE_HEIGHT = 14
const PIXEL_STABLE_CANVAS_WIDTH = 14
const PIXEL_STABLE_CANVAS_HEIGHT = 14
const PIXEL_STABLE_CONTENT_WIDTH = 10
const PIXEL_STABLE_CONTENT_HEIGHT = 12
const PIXEL_STABLE_CONTENT_X_OFFSET = Math.floor(
  (PIXEL_STABLE_CANVAS_WIDTH - PIXEL_STABLE_CONTENT_WIDTH) / 2,
)
const PIXEL_STABLE_CONTENT_Y_OFFSET =
  PIXEL_STABLE_CANVAS_HEIGHT - PIXEL_STABLE_CONTENT_HEIGHT
const PIXEL_TERMINAL_CANVAS_WIDTH = 11
const PIXEL_CANVAS_WIDTH = PIXEL_TERMINAL_CANVAS_WIDTH * 2
const PIXEL_CANVAS_HEIGHT = 6
const EMPTY_PIXEL_SOURCE_ROW = '.'.repeat(PIXEL_SOURCE_WIDTH)

function parseRgb(rgb: string): [number, number, number] {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) {
    return [0, 0, 0]
  }

  return [
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10),
    Number.parseInt(match[3]!, 10),
  ]
}

function toRgb(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.round(Math.max(0, Math.min(255, value)))
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`
}

function generateDiffColors(accent: string, isLightVariant: boolean): Theme {
  const [ar, ag, ab] = parseRgb(accent)

  if (isLightVariant) {
    return {
      diffAdded: toRgb(ar + 60, ag + 60, ab + 60),
      diffRemoved: 'rgb(255,200,200)',
      diffAddedDimmed: toRgb(ar + 90, ag + 90, ab + 90),
      diffRemovedDimmed: 'rgb(255,230,230)',
      diffAddedWord: toRgb(ar - 60, ag - 60, ab - 60),
      diffRemovedWord: 'rgb(180,40,40)',
    }
  }

  return {
    diffAdded: toRgb(ar * 0.55, ag * 0.55, ab * 0.55),
    diffRemoved: 'rgb(120,35,45)',
    diffAddedDimmed: toRgb(ar * 0.35, ag * 0.35, ab * 0.35),
    diffRemovedDimmed: 'rgb(95,45,55)',
    diffAddedWord: toRgb(ar + 70, ag + 70, ab + 70),
    diffRemovedWord: 'rgb(255,130,140)',
  }
}

function createPixelGrid(width: number, height: number): string[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => '.'),
  )
}

function fitRowsToPixelCanvas(rows: readonly string[]): string[] {
  let result = rows.map(row => {
    const currentWidth = row.length
    if (currentWidth === PIXEL_SOURCE_WIDTH) {
      return row
    }

    if (currentWidth < PIXEL_SOURCE_WIDTH) {
      const leftPad = Math.floor((PIXEL_SOURCE_WIDTH - currentWidth) / 2)
      const rightPad = PIXEL_SOURCE_WIDTH - currentWidth - leftPad
      return '.'.repeat(leftPad) + row + '.'.repeat(rightPad)
    }

    const leftCrop = Math.floor((currentWidth - PIXEL_SOURCE_WIDTH) / 2)
    return row.slice(leftCrop, leftCrop + PIXEL_SOURCE_WIDTH)
  })

  if (result.length > PIXEL_SOURCE_HEIGHT) {
    result = result.slice(result.length - PIXEL_SOURCE_HEIGHT)
  } else {
    while (result.length < PIXEL_SOURCE_HEIGHT) {
      result.unshift(EMPTY_PIXEL_SOURCE_ROW)
    }
  }

  return result
}

function getPixelBounds(rows: readonly string[]): PixelBounds | null {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y]!
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '.') {
        continue
      }

      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }

  if (!Number.isFinite(minX)) {
    return null
  }

  return { minX, maxX, minY, maxY }
}

function samplePixelContentGrid(
  rows: readonly string[],
  bounds: PixelBounds,
): string[][] {
  const sourceWidth = bounds.maxX - bounds.minX + 1
  const sourceHeight = bounds.maxY - bounds.minY + 1
  const contentGrid = createPixelGrid(
    PIXEL_STABLE_CONTENT_WIDTH,
    PIXEL_STABLE_CONTENT_HEIGHT,
  )

  for (let y = 0; y < PIXEL_STABLE_CONTENT_HEIGHT; y += 1) {
    const sourceY =
      sourceHeight === 1
        ? 0
        : Math.round(
            (y / (PIXEL_STABLE_CONTENT_HEIGHT - 1)) * (sourceHeight - 1),
          )

    for (let x = 0; x < PIXEL_STABLE_CONTENT_WIDTH; x += 1) {
      const sourceX =
        sourceWidth === 1
          ? 0
          : Math.round(
              (x / (PIXEL_STABLE_CONTENT_WIDTH - 1)) * (sourceWidth - 1),
            )

      contentGrid[y]![x] =
        rows[bounds.minY + sourceY]![bounds.minX + sourceX] === '.'
          ? '.'
          : 'X'
    }
  }

  return contentGrid
}

function paintScaledPixelCell(
  contentGrid: string[][],
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  pixel: string,
): void {
  const startX = Math.floor(
    (sourceX * PIXEL_STABLE_CONTENT_WIDTH) / sourceWidth,
  )
  const endX = Math.max(
    startX,
    Math.ceil(
      ((sourceX + 1) * PIXEL_STABLE_CONTENT_WIDTH) / sourceWidth,
    ) - 1,
  )
  const startY = Math.floor(
    (sourceY * PIXEL_STABLE_CONTENT_HEIGHT) / sourceHeight,
  )
  const endY = Math.max(
    startY,
    Math.ceil(
      ((sourceY + 1) * PIXEL_STABLE_CONTENT_HEIGHT) / sourceHeight,
    ) - 1,
  )

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      contentGrid[y]![x] = pixel
    }
  }
}

function stampPixelContentEdges(
  contentGrid: string[][],
  rows: readonly string[],
  bounds: PixelBounds,
): void {
  const sourceWidth = bounds.maxX - bounds.minX + 1
  const sourceHeight = bounds.maxY - bounds.minY + 1

  for (let sourceY = 0; sourceY < sourceHeight; sourceY += 1) {
    for (let sourceX = 0; sourceX < sourceWidth; sourceX += 1) {
      const pixel =
        rows[bounds.minY + sourceY]![bounds.minX + sourceX] === '.'
          ? '.'
          : 'X'
      const isEdgePixel =
        sourceX === 0 ||
        sourceX === sourceWidth - 1 ||
        sourceY === 0 ||
        sourceY === sourceHeight - 1

      if (pixel === '.' || !isEdgePixel) {
        continue
      }

      paintScaledPixelCell(
        contentGrid,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        pixel,
      )
    }
  }
}

function placePixelContentGrid(contentGrid: string[][]): string[] {
  const canvasGrid = createPixelGrid(
    PIXEL_STABLE_CANVAS_WIDTH,
    PIXEL_STABLE_CANVAS_HEIGHT,
  )

  for (let y = 0; y < PIXEL_STABLE_CONTENT_HEIGHT; y += 1) {
    for (let x = 0; x < PIXEL_STABLE_CONTENT_WIDTH; x += 1) {
      const pixel = contentGrid[y]![x]!
      if (pixel === '.') {
        continue
      }

      canvasGrid[PIXEL_STABLE_CONTENT_Y_OFFSET + y]![
        PIXEL_STABLE_CONTENT_X_OFFSET + x
      ] = pixel
    }
  }

  return canvasGrid.map(row => row.join(''))
}

function downscaleStablePixelRows(rows: readonly string[]): string[] {
  const downscaledRows: string[] = []

  for (let y = 0; y < PIXEL_CANVAS_HEIGHT; y += 1) {
    const sourceRowStart = Math.floor((y * rows.length) / PIXEL_CANVAS_HEIGHT)
    const sourceRowEnd = Math.max(
      sourceRowStart + 1,
      Math.ceil(((y + 1) * rows.length) / PIXEL_CANVAS_HEIGHT),
    )
    let row = ''

    for (let x = 0; x < PIXEL_CANVAS_WIDTH; x += 1) {
      const sourceColumnStart = Math.floor(
        (x * rows[0]!.length) / PIXEL_CANVAS_WIDTH,
      )
      const sourceColumnEnd = Math.max(
        sourceColumnStart + 1,
        Math.ceil(((x + 1) * rows[0]!.length) / PIXEL_CANVAS_WIDTH),
      )
      const sourceArea =
        (sourceRowEnd - sourceRowStart) * (sourceColumnEnd - sourceColumnStart)
      let filledCount = 0

      for (let sourceY = sourceRowStart; sourceY < sourceRowEnd; sourceY += 1) {
        for (
          let sourceX = sourceColumnStart;
          sourceX < sourceColumnEnd;
          sourceX += 1
        ) {
          if ((rows[sourceY]![sourceX] ?? '.') !== '.') {
            filledCount += 1
          }
        }
      }

      row += filledCount >= Math.ceil(sourceArea / 3) ? 'X' : '.'
    }

    downscaledRows.push(row)
  }

  return fillBlankPixelRows(downscaledRows)
}

function isBlankPixelRow(row: string): boolean {
  return !row.split('').some(pixel => pixel !== '.')
}

function fillBlankPixelRows(rows: readonly string[]): string[] {
  const filledRows = [...rows]

  for (let index = 0; index < filledRows.length; index += 1) {
    if (!isBlankPixelRow(filledRows[index]!)) {
      continue
    }

    let previousIndex = index - 1
    while (
      previousIndex >= 0 &&
      isBlankPixelRow(filledRows[previousIndex]!)
    ) {
      previousIndex -= 1
    }

    let nextIndex = index + 1
    while (
      nextIndex < filledRows.length &&
      isBlankPixelRow(filledRows[nextIndex]!)
    ) {
      nextIndex += 1
    }

    if (previousIndex < 0 && nextIndex >= filledRows.length) {
      continue
    }

    if (previousIndex < 0) {
      filledRows[index] = filledRows[nextIndex]!
      continue
    }

    if (nextIndex >= filledRows.length) {
      filledRows[index] = filledRows[previousIndex]!
      continue
    }

    const previousRow = filledRows[previousIndex]!
    const nextRow = filledRows[nextIndex]!
    let mergedRow = ''

    for (let columnIndex = 0; columnIndex < previousRow.length; columnIndex += 1) {
      mergedRow +=
        nextRow[columnIndex] !== '.' ? 'X' : previousRow[columnIndex]
    }

    filledRows[index] = mergedRow
  }

  return filledRows
}

const DARK_THEME_BASE: Theme = {
  autoAccept: 'rgb(175,135,255)',
  bashBorder: 'rgb(253,93,177)',
  claude: 'rgb(215,119,87)',
  claudeShimmer: 'rgb(235,159,127)',
  claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(147,165,255)',
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(177,195,255)',
  permission: 'rgb(177,185,249)',
  permissionShimmer: 'rgb(207,215,255)',
  planMode: 'rgb(72,150,140)',
  ide: 'rgb(71,130,200)',
  promptBorder: 'rgb(136,136,136)',
  promptBorderShimmer: 'rgb(166,166,166)',
  text: 'rgb(255,255,255)',
  inverseText: 'rgb(0,0,0)',
  inactive: 'rgb(153,153,153)',
  inactiveShimmer: 'rgb(193,193,193)',
  subtle: 'rgb(80,80,80)',
  suggestion: 'rgb(177,185,249)',
  remember: 'rgb(177,185,249)',
  background: 'rgb(0,204,204)',
  success: 'rgb(78,186,101)',
  error: 'rgb(255,107,128)',
  warning: 'rgb(255,193,7)',
  merged: 'rgb(175,135,255)',
  warningShimmer: 'rgb(255,223,57)',
  diffAdded: 'rgb(34,92,43)',
  diffRemoved: 'rgb(122,41,54)',
  diffAddedDimmed: 'rgb(71,88,74)',
  diffRemovedDimmed: 'rgb(105,72,77)',
  diffAddedWord: 'rgb(56,166,96)',
  diffRemovedWord: 'rgb(179,89,107)',
  red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
  orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
  professionalBlue: 'rgb(106,155,204)',
  chromeYellow: 'rgb(251,188,4)',
  clawd_body: 'rgb(215,119,87)',
  clawd_background: 'rgb(0,0,0)',
  userMessageBackground: 'rgb(55,55,55)',
  userMessageBackgroundHover: 'rgb(70,70,70)',
  messageActionsBackground: 'rgb(44,50,62)',
  selectionBg: 'rgb(38,79,120)',
  bashMessageBackgroundColor: 'rgb(65,60,65)',
  memoryBackgroundColor: 'rgb(55,65,70)',
  rate_limit_fill: 'rgb(177,185,249)',
  rate_limit_empty: 'rgb(80,83,112)',
  fastMode: 'rgb(255,120,20)',
  fastModeShimmer: 'rgb(255,165,70)',
  briefLabelYou: 'rgb(122,180,232)',
  briefLabelClaude: 'rgb(215,119,87)',
  rainbow_red: 'rgb(235,95,87)',
  rainbow_orange: 'rgb(245,139,87)',
  rainbow_yellow: 'rgb(250,195,95)',
  rainbow_green: 'rgb(145,200,130)',
  rainbow_blue: 'rgb(130,170,220)',
  rainbow_indigo: 'rgb(155,130,200)',
  rainbow_violet: 'rgb(200,130,180)',
  rainbow_red_shimmer: 'rgb(250,155,147)',
  rainbow_orange_shimmer: 'rgb(255,185,137)',
  rainbow_yellow_shimmer: 'rgb(255,225,155)',
  rainbow_green_shimmer: 'rgb(185,230,180)',
  rainbow_blue_shimmer: 'rgb(180,205,240)',
  rainbow_indigo_shimmer: 'rgb(195,180,230)',
  rainbow_violet_shimmer: 'rgb(230,180,210)',
  syntaxKeyword: 'rgb(249,38,114)',
  syntaxStorage: 'rgb(102,217,239)',
  syntaxBuiltIn: 'rgb(166,226,46)',
  syntaxType: 'rgb(166,226,46)',
  syntaxLiteral: 'rgb(190,132,255)',
  syntaxNumber: 'rgb(190,132,255)',
  syntaxString: 'rgb(230,219,116)',
  syntaxTitle: 'rgb(166,226,46)',
  syntaxParams: 'rgb(253,151,31)',
  syntaxComment: 'rgb(117,113,94)',
  syntaxMeta: 'rgb(117,113,94)',
  syntaxAttr: 'rgb(166,226,46)',
  syntaxAttribute: 'rgb(166,226,46)',
  syntaxVariable: 'rgb(255,255,255)',
  syntaxVariableLanguage: 'rgb(255,255,255)',
  syntaxProperty: 'rgb(255,255,255)',
  syntaxOperator: 'rgb(249,38,114)',
  syntaxPunctuation: 'rgb(248,248,242)',
  syntaxSymbol: 'rgb(190,132,255)',
  syntaxRegexp: 'rgb(230,219,116)',
  syntaxSubst: 'rgb(248,248,242)',
}

const LIGHT_THEME_BASE: Theme = {
  autoAccept: 'rgb(135,0,255)',
  bashBorder: 'rgb(255,0,135)',
  claude: 'rgb(215,119,87)',
  claudeShimmer: 'rgb(245,149,117)',
  claudeBlue_FOR_SYSTEM_SPINNER: 'rgb(87,105,247)',
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(117,135,255)',
  permission: 'rgb(87,105,247)',
  permissionShimmer: 'rgb(137,155,255)',
  planMode: 'rgb(0,102,102)',
  ide: 'rgb(71,130,200)',
  promptBorder: 'rgb(153,153,153)',
  promptBorderShimmer: 'rgb(183,183,183)',
  text: 'rgb(0,0,0)',
  inverseText: 'rgb(255,255,255)',
  inactive: 'rgb(102,102,102)',
  inactiveShimmer: 'rgb(142,142,142)',
  subtle: 'rgb(175,175,175)',
  suggestion: 'rgb(87,105,247)',
  remember: 'rgb(0,0,255)',
  background: 'rgb(0,153,153)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  merged: 'rgb(135,0,255)',
  warningShimmer: 'rgb(200,158,80)',
  diffAdded: 'rgb(105,219,124)',
  diffRemoved: 'rgb(255,168,180)',
  diffAddedDimmed: 'rgb(199,225,203)',
  diffRemovedDimmed: 'rgb(253,210,216)',
  diffAddedWord: 'rgb(47,157,68)',
  diffRemovedWord: 'rgb(209,69,75)',
  red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(147,51,234)',
  orange_FOR_SUBAGENTS_ONLY: 'rgb(234,88,12)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
  professionalBlue: 'rgb(106,155,204)',
  chromeYellow: 'rgb(251,188,4)',
  clawd_body: 'rgb(215,119,87)',
  clawd_background: 'rgb(0,0,0)',
  userMessageBackground: 'rgb(240,240,240)',
  userMessageBackgroundHover: 'rgb(252,252,252)',
  messageActionsBackground: 'rgb(232,236,244)',
  selectionBg: 'rgb(180,213,255)',
  bashMessageBackgroundColor: 'rgb(250,245,250)',
  memoryBackgroundColor: 'rgb(230,245,250)',
  rate_limit_fill: 'rgb(87,105,247)',
  rate_limit_empty: 'rgb(39,47,111)',
  fastMode: 'rgb(255,106,0)',
  fastModeShimmer: 'rgb(255,150,50)',
  briefLabelYou: 'rgb(37,99,235)',
  briefLabelClaude: 'rgb(215,119,87)',
  rainbow_red: 'rgb(235,95,87)',
  rainbow_orange: 'rgb(245,139,87)',
  rainbow_yellow: 'rgb(250,195,95)',
  rainbow_green: 'rgb(145,200,130)',
  rainbow_blue: 'rgb(130,170,220)',
  rainbow_indigo: 'rgb(155,130,200)',
  rainbow_violet: 'rgb(200,130,180)',
  rainbow_red_shimmer: 'rgb(250,155,147)',
  rainbow_orange_shimmer: 'rgb(255,185,137)',
  rainbow_yellow_shimmer: 'rgb(255,225,155)',
  rainbow_green_shimmer: 'rgb(185,230,180)',
  rainbow_blue_shimmer: 'rgb(180,205,240)',
  rainbow_indigo_shimmer: 'rgb(195,180,230)',
  rainbow_violet_shimmer: 'rgb(230,180,210)',
  syntaxKeyword: 'rgb(167,29,93)',
  syntaxStorage: 'rgb(167,29,93)',
  syntaxBuiltIn: 'rgb(0,134,179)',
  syntaxType: 'rgb(0,134,179)',
  syntaxLiteral: 'rgb(0,134,179)',
  syntaxNumber: 'rgb(0,134,179)',
  syntaxString: 'rgb(24,54,145)',
  syntaxTitle: 'rgb(121,93,163)',
  syntaxParams: 'rgb(0,134,179)',
  syntaxComment: 'rgb(150,152,150)',
  syntaxMeta: 'rgb(150,152,150)',
  syntaxAttr: 'rgb(0,134,179)',
  syntaxAttribute: 'rgb(0,134,179)',
  syntaxVariable: 'rgb(0,134,179)',
  syntaxVariableLanguage: 'rgb(0,134,179)',
  syntaxProperty: 'rgb(0,134,179)',
  syntaxOperator: 'rgb(167,29,93)',
  syntaxPunctuation: 'rgb(51,51,51)',
  syntaxSymbol: 'rgb(0,134,179)',
  syntaxRegexp: 'rgb(24,54,145)',
  syntaxSubst: 'rgb(51,51,51)',
}

export function createCharacterTheme(
  accent: string,
  shimmer: string,
  promptBorder: string,
  isLightVariant: boolean,
): Theme {
  const baseTheme = isLightVariant ? LIGHT_THEME_BASE : DARK_THEME_BASE

  return {
    ...baseTheme,
    bashBorder: isLightVariant ? 'rgb(200,200,200)' : 'rgb(72,90,112)',
    autoAccept: accent,
    claude: accent,
    claudeShimmer: shimmer,
    claudeBlue_FOR_SYSTEM_SPINNER: accent,
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: shimmer,
    permission: accent,
    permissionShimmer: shimmer,
    planMode: accent,
    promptBorder,
    promptBorderShimmer: shimmer,
    inactive: isLightVariant ? 'rgb(150,150,150)' : 'rgb(146,156,170)',
    inactiveShimmer: isLightVariant ? 'rgb(180,180,180)' : 'rgb(194,204,216)',
    subtle: isLightVariant ? 'rgb(200,200,200)' : 'rgb(54,65,79)',
    suggestion: accent,
    remember: accent,
    background: isLightVariant ? 'rgb(240,240,240)' : 'rgb(16,36,50)',
    success: isLightVariant ? 'rgb(44,122,57)' : 'rgb(110,198,128)',
    warning: isLightVariant ? 'rgb(150,108,30)' : 'rgb(255,195,77)',
    merged: accent,
    clawd_body: accent,
    clawd_background: isLightVariant ? 'rgb(255,255,255)' : 'rgb(8,11,16)',
    userMessageBackground: isLightVariant ? 'rgb(240,240,240)' : 'rgb(45,50,60)',
    userMessageBackgroundHover: isLightVariant ? 'rgb(252,252,252)' : 'rgb(55,60,72)',
    messageActionsBackground: isLightVariant ? 'rgb(232,236,244)' : 'rgb(35,42,55)',
    selectionBg: isLightVariant ? 'rgb(180,213,255)' : 'rgb(44,80,120)',
    bashMessageBackgroundColor: isLightVariant ? 'rgb(250,245,250)' : 'rgb(24,28,35)',
    memoryBackgroundColor: isLightVariant ? 'rgb(230,245,250)' : 'rgb(20,32,42)',
    rate_limit_fill: accent,
    rate_limit_empty: isLightVariant ? 'rgb(200,200,220)' : 'rgb(55,71,92)',
    fastMode: accent,
    fastModeShimmer: shimmer,
    briefLabelYou: isLightVariant ? 'rgb(37,99,235)' : 'rgb(130,184,235)',
    briefLabelClaude: accent,
    ...generateDiffColors(accent, isLightVariant),
    syntaxKeyword: accent,
    syntaxStorage: shimmer,
    syntaxBuiltIn: accent,
    syntaxType: accent,
    syntaxLiteral: shimmer,
    syntaxNumber: shimmer,
    syntaxString: isLightVariant ? 'rgb(24,54,145)' : 'rgb(230,219,116)',
    syntaxTitle: accent,
    syntaxParams: isLightVariant ? 'rgb(0,134,179)' : 'rgb(253,151,31)',
    syntaxComment: isLightVariant ? 'rgb(150,152,150)' : 'rgb(117,113,94)',
    syntaxMeta: isLightVariant ? 'rgb(150,152,150)' : 'rgb(117,113,94)',
    syntaxAttr: accent,
    syntaxAttribute: accent,
    syntaxVariable: isLightVariant ? 'rgb(0,134,179)' : 'rgb(255,255,255)',
    syntaxVariableLanguage: isLightVariant ? 'rgb(0,134,179)' : 'rgb(255,255,255)',
    syntaxProperty: isLightVariant ? 'rgb(0,134,179)' : 'rgb(255,255,255)',
    syntaxOperator: accent,
    syntaxPunctuation: isLightVariant ? 'rgb(51,51,51)' : 'rgb(248,248,242)',
    syntaxSymbol: shimmer,
    syntaxRegexp: isLightVariant ? 'rgb(24,54,145)' : 'rgb(230,219,116)',
    syntaxSubst: isLightVariant ? 'rgb(51,51,51)' : 'rgb(248,248,242)',
  }
}

export const BASE_PIXEL_THEME_SEEDS = Object.freeze([
  { name: 'barnacle-boy', displayName: 'Barnacle Boy', accent: 'rgb(25,118,210)', shimmer: 'rgb(118,180,241)', promptBorder: 'rgb(76,119,168)' },
  { name: 'bubble-bass', displayName: 'Bubble Bass', accent: 'rgb(102,187,106)', shimmer: 'rgb(180,228,182)', promptBorder: 'rgb(92,144,96)' },
  { name: 'dirty-bubble', displayName: 'Dirty Bubble', accent: 'rgb(156,204,101)', shimmer: 'rgb(208,236,169)', promptBorder: 'rgb(111,151,80)' },
  { name: 'dutchman', displayName: 'Dutchman', accent: 'rgb(102,187,106)', shimmer: 'rgb(178,227,181)', promptBorder: 'rgb(88,144,92)' },
  { name: 'french-narrator', displayName: 'French Narrator', accent: 'rgb(142,36,170)', shimmer: 'rgb(194,121,214)', promptBorder: 'rgb(118,82,152)' },
  { name: 'gary', displayName: 'Gary', accent: 'rgb(144,202,249)', shimmer: 'rgb(196,226,255)', promptBorder: 'rgb(103,149,184)' },
  { name: 'grandma', displayName: 'Grandma', accent: 'rgb(255,235,112)', shimmer: 'rgb(255,247,180)', promptBorder: 'rgb(182,164,86)' },
  { name: 'karen', displayName: 'Karen', accent: 'rgb(2,119,189)', shimmer: 'rgb(116,198,236)', promptBorder: 'rgb(64,116,148)' },
  { name: 'larry', displayName: 'Larry', accent: 'rgb(239,83,80)', shimmer: 'rgb(255,148,144)', promptBorder: 'rgb(186,79,76)' },
  { name: 'man-ray', displayName: 'Man Ray', accent: 'rgb(123,31,162)', shimmer: 'rgb(176,112,208)', promptBorder: 'rgb(115,67,154)' },
  { name: 'mermaid-man', displayName: 'Mermaid Man', accent: 'rgb(255,152,0)', shimmer: 'rgb(255,205,117)', promptBorder: 'rgb(181,128,61)' },
  { name: 'mr-krabs', displayName: 'Mr. Krabs', accent: 'rgb(239,83,80)', shimmer: 'rgb(255,148,144)', promptBorder: 'rgb(186,79,76)' },
  { name: 'mrs-puff', displayName: 'Mrs. Puff', accent: 'rgb(255,152,0)', shimmer: 'rgb(255,199,104)', promptBorder: 'rgb(184,122,56)' },
  { name: 'patrick', displayName: 'Patrick', accent: 'rgb(244,143,177)', shimmer: 'rgb(252,190,214)', promptBorder: 'rgb(184,118,151)' },
  { name: 'pearl', displayName: 'Pearl', accent: 'rgb(244,244,246)', shimmer: 'rgb(255,255,255)', promptBorder: 'rgb(168,168,176)' },
  { name: 'plankton', displayName: 'Plankton', accent: 'rgb(129,199,132)', shimmer: 'rgb(184,232,186)', promptBorder: 'rgb(92,147,96)' },
  { name: 'sandy', displayName: 'Sandy', accent: 'rgb(41,121,255)', shimmer: 'rgb(125,180,255)', promptBorder: 'rgb(78,122,184)' },
  { name: 'spongebob', displayName: 'SpongeBob', accent: 'rgb(253,216,53)', shimmer: 'rgb(255,232,120)', promptBorder: 'rgb(184,160,62)' },
  { name: 'squidward', displayName: 'Squidward', accent: 'rgb(38,166,154)', shimmer: 'rgb(116,218,208)', promptBorder: 'rgb(70,150,142)' },
  { name: 'squilliam', displayName: 'Squilliam', accent: 'rgb(52,168,210)', shimmer: 'rgb(130,218,246)', promptBorder: 'rgb(73,137,154)' },
] as const satisfies readonly PixelThemeSeed[])

export const PIXEL_THEME_NAMES = Object.freeze(
  BASE_PIXEL_THEME_SEEDS.flatMap(seed => [seed.name, `light-${seed.name}`]),
)

const PIXEL_THEME_NAME_SET = new Set<string>(PIXEL_THEME_NAMES)

export function isPixelThemeName(value: string): boolean {
  return PIXEL_THEME_NAME_SET.has(value)
}

export function buildPixelThemePayload(): Record<string, Theme> {
  const payload: Record<string, Theme> = {}

  for (const seed of BASE_PIXEL_THEME_SEEDS) {
    payload[seed.name] = createCharacterTheme(
      seed.accent,
      seed.shimmer,
      seed.promptBorder,
      false,
    )
    payload[`light-${seed.name}`] = createCharacterTheme(
      seed.accent,
      seed.shimmer,
      seed.promptBorder,
      true,
    )
  }

  return payload
}

function normalizePixelRows(rows: readonly string[]): string[] {
  const canvasRows = fitRowsToPixelCanvas(rows)
  const bounds = getPixelBounds(canvasRows)
  if (!bounds) {
    return canvasRows
  }

  // Keep every mascot inside one shared inner box so theme switches stay still.
  const contentGrid = samplePixelContentGrid(canvasRows, bounds)
  stampPixelContentEdges(contentGrid, canvasRows, bounds)
  const stableRows = placePixelContentGrid(contentGrid)
  return downscaleStablePixelRows(stableRows)
}

function normalizePixelSilhouetteRows(rows: readonly string[]): string[] {
  let normalizedRows = rows.map(row => {
    const expandedRow =
      row.length === PIXEL_TERMINAL_CANVAS_WIDTH
        ? row
            .split('')
            .map((pixel, index, pixels) => {
              if (pixel === '.') {
                return '..'
              }

              const leftFilled = index > 0 && pixels[index - 1] !== '.'
              const rightFilled =
                index < pixels.length - 1 && pixels[index + 1] !== '.'

              if (!leftFilled && rightFilled) {
                return '.X'
              }

              if (leftFilled && !rightFilled) {
                return 'X.'
              }

              return 'XX'
            })
            .join('')
        : row

    if (expandedRow.length === PIXEL_CANVAS_WIDTH) {
      return expandedRow
    }

    if (expandedRow.length < PIXEL_CANVAS_WIDTH) {
      const leftPad = Math.floor(
        (PIXEL_CANVAS_WIDTH - expandedRow.length) / 2,
      )
      const rightPad = PIXEL_CANVAS_WIDTH - expandedRow.length - leftPad
      return '.'.repeat(leftPad) + expandedRow + '.'.repeat(rightPad)
    }

    const leftCrop = Math.floor((expandedRow.length - PIXEL_CANVAS_WIDTH) / 2)
    return expandedRow.slice(leftCrop, leftCrop + PIXEL_CANVAS_WIDTH)
  })

  if (normalizedRows.length > PIXEL_CANVAS_HEIGHT) {
    normalizedRows = normalizedRows.slice(
      normalizedRows.length - PIXEL_CANVAS_HEIGHT,
    )
  }

  while (normalizedRows.length < PIXEL_CANVAS_HEIGHT) {
    normalizedRows.unshift('.'.repeat(PIXEL_CANVAS_WIDTH))
  }

  return fillBlankPixelRows(normalizedRows).map(row =>
    row
      .split('')
      .map(pixel => (pixel === '.' ? '.' : 'X'))
      .join(''),
  )
}

const PIXEL_GLYPH_WIDTH = 11
const PIXEL_GLYPH_HEIGHT = 3

const PIXEL_GLYPH_TO_MASK = Object.freeze<Record<string, number>>({
  ' ': 0,
  '▘': 1,
  '▝': 2,
  '▀': 3,
  '▖': 4,
  '▌': 5,
  '▞': 6,
  '▛': 7,
  '▗': 8,
  '▚': 9,
  '▐': 10,
  '▜': 11,
  '▄': 12,
  '▙': 13,
  '▟': 14,
  '█': 15,
})

function normalizePixelGlyphRows(rows: readonly string[]): string[] {
  let normalizedRows = rows.map(row => {
    if (row.length === PIXEL_GLYPH_WIDTH) {
      return row
    }

    if (row.length < PIXEL_GLYPH_WIDTH) {
      const leftPad = Math.floor((PIXEL_GLYPH_WIDTH - row.length) / 2)
      const rightPad = PIXEL_GLYPH_WIDTH - row.length - leftPad
      return ' '.repeat(leftPad) + row + ' '.repeat(rightPad)
    }

    const leftCrop = Math.floor((row.length - PIXEL_GLYPH_WIDTH) / 2)
    return row.slice(leftCrop, leftCrop + PIXEL_GLYPH_WIDTH)
  })

  if (normalizedRows.length > PIXEL_GLYPH_HEIGHT) {
    normalizedRows = normalizedRows.slice(
      normalizedRows.length - PIXEL_GLYPH_HEIGHT,
    )
  }

  while (normalizedRows.length < PIXEL_GLYPH_HEIGHT) {
    normalizedRows.unshift(' '.repeat(PIXEL_GLYPH_WIDTH))
  }

  return normalizedRows
}

function convertPixelGlyphRowsToPixelRows(rows: readonly string[]): string[] {
  const glyphRows = normalizePixelGlyphRows(rows)
  const pixelRows = Array.from({ length: PIXEL_GLYPH_HEIGHT * 2 }, () =>
    Array.from({ length: PIXEL_GLYPH_WIDTH * 2 }, () => '.'),
  )

  for (let rowIndex = 0; rowIndex < glyphRows.length; rowIndex += 1) {
    const row = glyphRows[rowIndex]!

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const mask = PIXEL_GLYPH_TO_MASK[row[columnIndex]!] ?? 0
      const topRow = rowIndex * 2
      const leftColumn = columnIndex * 2

      if ((mask & 1) !== 0) {
        pixelRows[topRow]![leftColumn] = 'X'
      }
      if ((mask & 2) !== 0) {
        pixelRows[topRow]![leftColumn + 1] = 'X'
      }
      if ((mask & 4) !== 0) {
        pixelRows[topRow + 1]![leftColumn] = 'X'
      }
      if ((mask & 8) !== 0) {
        pixelRows[topRow + 1]![leftColumn + 1] = 'X'
      }
    }
  }

  return pixelRows.map(row => row.join(''))
}

const OFFICIAL_THEME_PICKER_OPTIONS = Object.freeze<ThemePickerOption[]>([
  { label: 'Auto (match terminal)', value: 'auto' },
  { label: 'Dark mode', value: 'dark' },
  { label: 'Light mode', value: 'light' },
  {
    label: 'Dark mode (colorblind-friendly)',
    value: 'dark-daltonized',
  },
  {
    label: 'Light mode (colorblind-friendly)',
    value: 'light-daltonized',
  },
  {
    label: 'Dark mode (ANSI colors only)',
    value: 'dark-ansi',
  },
  {
    label: 'Light mode (ANSI colors only)',
    value: 'light-ansi',
  },
])

const BASE_PIXEL_THEME_ROWS = Object.freeze<Record<string, readonly string[]>>({
  'barnacle-boy': [
    '...BBBBBBBB...',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '...BBBBBBBB...',
    '...PPPPPPPP...',
    '..PPPPPPPPPP..',
    '...BBBBBBBB...',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '...WWWWWWWW...',
    '...WW....WW...',
  ],
  'bubble-bass': [
    '....GGGGGG....',
    '...GGGGGGGG...',
    '..GGGGGGGGGG..',
    '..GGGEEEEGG...',
    '..GGGGGGGGGG..',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    'GGGGGGGGGGGGGG',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..',
    '..GGGGGGGGGG..',
    '...GG....GG...',
    '...GG....GG...',
  ],
  'dirty-bubble': [
    '.....DD.......',
    '....DDDD......',
    '...DDDDDD.....',
    '..DDDDDDDD....',
    '..DDDDDDDD....',
    '..DDDDEEDDD...',
    '..DDDDDDDD....',
    '..DDDDDDDD....',
    '...DDDDDD.....',
    '....DDDD......',
    '.....DD.......',
  ],
  dutchman: [
    '...GGGGGG.....',
    '..GGGGGGGG....',
    '.GGGGGGGGGG...',
    '.GGGGEEEGGG...',
    '.GGGGGGGGGG...',
    '..GGGGGGGG....',
    '...GGGGGG.....',
    '..GGGGGGGG....',
    '.GGGGGGGGGG...',
    '.GGGGGGGGGG...',
    '..GG......GG..',
    '..GG......GG..',
  ],
  'french-narrator': [
    '.....MM.......',
    '....MMMM......',
    '...MMMMMM.....',
    '..MMMMMMMM....',
    '..MMMMMMMM....',
    '..MMMEMMMM....',
    '..MMMMMMMM....',
    '...MMMMMM.....',
    '..MMMMMMMM....',
    '..MM....MM....',
    '..MM....MM....',
  ],
  gary: [
    '......AA......',
    '.....AAAA.....',
    '....AAAAAA....',
    '...AAAAAAA....',
    '..AAAAALAAA...',
    '..AALLLLAA....',
    '...AAAAAAA....',
    '....AAAAAA....',
    '.....AAAA.....',
    '..BBBBBBBBBB..',
    '.BBBBBBBBBBBB.',
    '.BBBBBBBBBBBB.',
    '..BBBBBBBBBB..',
  ],
  grandma: [
    '..WWWWWWWWWW..',
    '.WWWWWWWWWWWW.',
    '.WWWWWWWWWWWW.',
    '.WWWWWWWWWWWW.',
    '..WWWWWWWWWW..',
    '...YYYYYYYY...',
    '..YYYYYYYYYY..',
    '..YYYYYYYYYY..',
    '..YYYYYYYYYY..',
    '...YYYYYYYY...',
    '..SSSSSSSSSS..',
    '..SS......SS..',
    '..SS......SS..',
  ],
  karen: [
    'WWWWWWWWWWWWWW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WCCCCCCCCCCCW',
    'WWWWWWWWWWWWWW',
    '.....WWWW.....',
    '....WWWWWW....',
  ],
  larry: [
    '.RR........RR.',
    '..RRRRRRRRRR..',
    '..RRRRRRRRRR..',
    '...RRRRRRRR...',
    '...RRRRRRRR...',
    '....RRRRRR....',
    '...RRRRRRRR...',
    '..RRRRRRRRRR..',
    '.RRRRRRRRRRRR.',
    '.RR.RR.RR.RR..',
    '.RR........RR.',
  ],
  'man-ray': [
    '.....MM.......',
    '....MMMM......',
    '...MMMMMM.....',
    '..MMMMMMMM....',
    '..MMMMMMMM....',
    '..MMMEMMMM....',
    '..MMMMMMMM....',
    '...MMMMMM.....',
    '..MMMMMMMM....',
    '..MMMMMMMM....',
    '.MM......MM...',
    '.MM......MM...',
  ],
  'mermaid-man': [
    '....OOOOOO....',
    '...OOOOOOOO...',
    '..OOOOOOOOOO..',
    '..OOOMMMMOOO..',
    '..OOOOOOOOOO..',
    '..OOOOOOOOOO..',
    '...OOOOOOOO...',
    '..YYYYYYYYYY..',
    '..YYYYYYYYYY..',
    '..YYYYYYYYYY..',
    '...WWWWWWWW...',
    '...WW....WW...',
  ],
  'mr-krabs': [
    '.RR........RR.',
    '..RRRRRRRRRR..',
    '..RRRRRRRRRR..',
    '..RRRRRRRRRR..',
    '..RRRREERRRR..',
    '..RRRRRRRRRR..',
    '..RRRRRRRRRR..',
    '....RRRRRR....',
    '.....YYYY.....',
    '.....YYYY.....',
    '.....YYYY.....',
    '....WWWWWW....',
    '....WW..WW....',
    '....WW..WW....',
  ],
  'mrs-puff': [
    '......OO......',
    '.....OOOO.....',
    '....OOOOOO....',
    '...OOOOOOOO...',
    '..OOOOOOOOOO..',
    '..OOOOEEOOOO..',
    '..OOOOOOOOOO..',
    '..OOOOOOOOOO..',
    '..OOOOOOOOOO..',
    '..OOOOOOOOOO..',
    '...OOOOOOOO...',
    '....OOOOOO....',
    '...OO....OO...',
    '...OO....OO...',
  ],
  patrick: [
    '......PP......',
    '.....PPPP.....',
    '....PPPPPP....',
    '...PPPPPPPP...',
    '..PPPPPPPPPP..',
    '..PPPPPPPPPP..',
    '...PPPPPPPP...',
    '...PPPPPPPP...',
    '....PPPPPP....',
    '...GGGGGGGG...',
    '..GGGGGGGGGG..',
    '..GGBBGGBBGG..',
    '..GGGGGGGGGG..',
    '...GG....GG...',
  ],
  pearl: [
    '....WWWWWW....',
    '...WWWWWWWW...',
    '..WWWWWWWWWW..',
    '..WWWWWWWWWW..',
    '..WWWWEWWWWW..',
    '..WWWWWWWWWW..',
    '..WWWWWWWWWW..',
    '..WWWWWWWWWW..',
    '...WWWWWWWW...',
    '...WWWWWWWW...',
    '....WWWWWW....',
    '....WWWWWW....',
    '...WW....WW...',
    '...WW....WW...',
  ],
  plankton: [
    '..GG......GG..',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '.GGGGGGEEEGGG.',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..',
    '....GGGGGG....',
    '...GGGGGGGG...',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..',
    '....GGGGGG....',
  ],
  sandy: [
    '....HHHHHH....',
    '...HHHHHHHH...',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '...HHHHHHHH...',
    '....BBBBBB....',
    '...BBBBBBBB...',
    '...BBBBBBBB...',
    '....BBBBBB....',
    '...GGGGGGGG...',
    '...GG....GG...',
  ],
  spongebob: [
    '....YYYYYY....',
    '...YYYYYYYY...',
    '..WWYYYYYYWW..',
    '..WWBBYYBBWW..',
    '...YYYYYYYY...',
    '..YNNYYYYNNY..',
    '..YYYYYYYYYY..',
    '...RRRRRRRR...',
    '...YYYYYYYY...',
    '...YYYYYYYY...',
    '...YYYYYYYY...',
    '...YYYYYYYY...',
    '..SSSSSSSSSS..',
    '..SS......SS..',
    '..SS......SS..',
  ],
  squidward: [
    '.....TTTT.....',
    '....TTTTTT....',
    '...TTTTTTTT...',
    '..TTTTTTTTTT..',
    '..TTTTNTTTTT..',
    '..TTTTTTTTTT..',
    '...TTTTTTTT...',
    '....TTTTTT....',
    '.....TTTT.....',
    '....TTTTTT....',
    '...TTTTTTTT...',
    '..TTTTTTTTTT..',
    '..TTTTTTTTTT..',
    '...TT....TT...',
    '...TT....TT...',
  ],
  squilliam: [
    '...BBBBBBBB...',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '...TTTTTTTT...',
    '..TTTTNTTTTT..',
    '..TTTTTTTTTT..',
    '....TTTTTT....',
    '...TTTTTTTT...',
    '..TTTTTTTTTT..',
    '..TTTTTTTTTT..',
    '...TT....TT...',
    '...TT....TT...',
  ],
})

const PIXEL_MASCOT_SILHOUETTE_OVERRIDES = Object.freeze<
  Record<string, readonly string[]>
>({
  spongebob: [
    '..XXXXXXX..',
    '..XXXXXXX..',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '..XXXXXXX..',
    '.XX.....XX.',
  ],
  patrick: [
    '.....X.....',
    '....XXX....',
    '...XXXXX...',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '..XX...XX..',
  ],
  squidward: [
    '...XXXXX...',
    '..XXXXXXX..',
    '....XXX....',
    '...XXXXX...',
    '..XXXXXXX..',
    '..XX...XX..',
  ],
  'mr-krabs': [
    '.XX.....XX.',
    '..XX...XX..',
    '..XXXXXXX..',
    '..XXXXXXX..',
    '....XXX....',
    '...XX.XX...',
  ],
  sandy: [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX.....XX.',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '..XX...XX..',
  ],
  gary: [
    '....XXX....',
    '...XXXXX...',
    '..XX..XX...',
    '.XXXXXXXXX.',
    'XXXXXXXXXXX',
    '..XX...XX..',
  ],
  'mrs-puff': [
    '....XXX....',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '...XX.XX...',
  ],
  pearl: [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..X..XX.',
    '.XXXXXXXXX.',
    '...XXXXX...',
    '...XX.XX...',
  ],
  larry: [
    '.XX.....XX.',
    '..XX...XX..',
    '..XXXXXXX..',
    '...XXXXX...',
    '..XXXXXXX..',
    '.XX.....XX.',
  ],
  plankton: [
    '.XX.....XX.',
    '..XX...XX..',
    '...XXXXX...',
    '...XX.XX...',
    '....XXX....',
    '...XXXXX...',
  ],
  karen: [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..X..XX.',
    '.XXXXXXXXX.',
    '...XXXXX...',
    '...XXXXX...',
  ],
  'mermaid-man': [
    '...XXXXX...',
    '..XXXXXXX..',
    '.XX..X..XX.',
    '.XXXXXXXXX.',
    '...XXXXX...',
    '..XX...XX..',
  ],
  'barnacle-boy': [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '..XXXXXXX..',
    '..XX...XX..',
  ],
  dutchman: [
    '...XXXXX...',
    '..XXXXXXX..',
    '.XXX...XX..',
    '..XXXXXXX..',
    '...XXXXX...',
    '..XX....XX.',
  ],
  squilliam: [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '...XXXXX...',
    '...XX.XX...',
    '..XXXXXXX..',
    '..XX...XX..',
  ],
  'bubble-bass': [
    '...XXXXX...',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    'XXXXXXXXXXX',
    '..XXXXXXX..',
    '...XX.XX...',
  ],
  grandma: [
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '...XXXXX...',
    '..XX...XX..',
  ],
  'man-ray': [
    '....XXX....',
    '..XXXXXXX..',
    '.XX..X..XX.',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '..XX...XX..',
  ],
  'dirty-bubble': [
    '....XXX....',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX...XXX..',
    '..XXXXXXX..',
    '....XXX....',
  ],
  'french-narrator': [
    '....XXX....',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX..XXXX..',
    '..XXXXXXX..',
    '..XX...XX..',
  ],
})

const PIXEL_MASCOT_GLYPH_OVERRIDES = Object.freeze<
  Record<string, readonly string[]>
>({
  'barnacle-boy': [' ▗▟▀███▀▙▖ ', '  ▐▘███▝▌  ', '  ▝█▟█▙█▘  '],
  'bubble-bass': [' ▗▟█████▙▖ ', ' ▐█▛███▜█▌ ', ' ▝▜▙▄▄▄▟▛▘ '],
  'dirty-bubble': [' ▗▞█████▚▖ ', ' ▐███▚███▌ ', ' ▝▚▙███▟▞▘ '],
  dutchman: [' ▗▟█████▙▖ ', ' ▐█▘███▝█▌ ', ' ▝█▖▘ ▝▗█▘ '],
  'french-narrator': [' ▗▀▜███▛▀▖ ', ' ▐▛█████▜▌ ', ' ▝▙▄█▟█▄▟▘ '],
  gary: [' ▗█▖   ▗█▖ ', '  ▝█▚▄▞█▘  ', ' ▗▛██▞██▜▖ '],
  grandma: ['  ▗▞█▀█▚▖  ', ' ▐█▘███▝█▌ ', ' ▝█▖▘█▝▗█▘ '],
  karen: [' ▗███████▖ ', ' ▐█▘███▝█▌ ', '   ▝█▄█▘   '],
  larry: ['▗█▄▖   ▗▄█▖', ' ▝███████▘ ', '  ▐█▌ ▐█▌  '],
  'man-ray': [' ▗▄█████▄▖ ', ' ▐█▘███▝█▌ ', ' ▝▜█▛█▜█▛▘ '],
  'mermaid-man': ['▗██▄█ █▄██▖', ' ▐█▘███▝█▌ ', ' ▝█▟▛█▜▙█▘ '],
  'mr-krabs': ['▗█▖ ▄█▄ ▗█▖', ' ▝▜█▀█▀█▛▘ ', '  ▐█▌ ▐█▌  '],
  'mrs-puff': [' ▗▞█████▚▖ ', ' ▐█▘███▝█▌ ', ' ▝▚█▄█▄█▞▘ '],
  patrick: ['   ▗█▄█▖   ', '  ▗█████▖  ', ' ▗█▘█ █▝█▖ '],
  pearl: [' ▗█▙███▟█▖ ', ' ▐█▘███▝█▌ ', ' ▝██▖ ▗██▘ '],
  plankton: [' ▗█▖   ▗█▖ ', '   ▐▛█▜▌   ', '   ▝█▄█▘   '],
  sandy: [' ▗▟▖███▗▙▖ ', ' ▐▘█████▝▌ ', ' ▝█▟███▙█▘ '],
  spongebob: [' ▗▛█▀▀▀█▜▖ ', ' ▐▌▘███▝▐▌ ', ' ▝▙█▄█▄█▟▘ '],
  squidward: ['  ▗▛█▀█▜▖  ', '   ▐▘█▝▌   ', '  ▗█▘ ▝█▖  '],
  squilliam: ['  ▗▜▀█▀▛▖  ', '   ▐▘█▝▌   ', '  ▗█▘ ▝█▖  '],
})

const PIXEL_STARTUP_POSE_OVERRIDES = Object.freeze<
  Record<string, Partial<Record<PixelStartupPose, readonly string[]>>>
>({
  spongebob: {
    default: [
      '....YYYYYY....',
      '...YYYYYYYY...',
      '..WWBYYYYBWW..',
      '..WWBYYYYBWW..',
      '...YNNYYNNY...',
      '...YNNYYNNY...',
      '...RRRRRRRR...',
      '...RRRRRRRR...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...SSSSSSSS...',
      '...SS....SS...',
    ],
    'look-left': [
      '....YYYYYY....',
      '...YYYYYYYY...',
      '..WBYYYYYYWW..',
      '..WBYYYYYYWW..',
      '...YNNYYNNY...',
      '...YNNYYNNY...',
      '...RRRRRRRR...',
      '...RRRRRRRR...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...SSSSSSSS...',
      '...SS....SS...',
    ],
    'look-right': [
      '....YYYYYY....',
      '...YYYYYYYY...',
      '..WWYYYYYYBW..',
      '..WWYYYYYYBW..',
      '...YNNYYNNY...',
      '...YNNYYNNY...',
      '...RRRRRRRR...',
      '...RRRRRRRR...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...SSSSSSSS...',
      '...SS....SS...',
    ],
    'arms-up': [
      'Y...YYYYYY...Y',
      'YY.YYYYYYYY.YY',
      '..WWBYYYYBWW..',
      '..WWBYYYYBWW..',
      '...YNNYYNNY...',
      '...YNNYYNNY...',
      '...RRRRRRRR...',
      '...RRRRRRRR...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...YYYYYYYY...',
      '...SSSSSSSS...',
      '...SS....SS...',
    ],
  },
  patrick: {
    default: [
      '..PP....',
      '..PPPP..',
      '.PPPPPP.',
      'PPPPPPPP',
      'PPPPPPPP',
      '.PPPPPP.',
      '.PPPPPP.',
      '..PPPP..',
      'GGGGGGGG',
      'GGGGGGGG',
      '.GG..GG.',
      '.PP..PP.',
    ],
  },
  'mr-krabs': {
    default: [
      '..RR..RR',
      '..RR..RR',
      'RRRRRRRR',
      'RRRRRRRR',
      'RRRERRRR',
      'RRRRRRRR',
      'RRRRRRRR',
      '..YYYY..',
      '..YYYY..',
      '..YYYY..',
      '..WWWW..',
      '..WW..WW',
    ],
  },
  plankton: {
    default: [
      '...GG..GG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGEEGGG..',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GG..GG...',
    ],
    'look-left': [
      '...GG..GG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGEEGGGG..',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GG..GG...',
    ],
    'look-right': [
      '...GG..GG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGEEGG..',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GG..GG...',
    ],
    'arms-up': [
      'GG.G....G.GG',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '..GGGEEGGG..',
      '..GGGGGGGG..',
      '...GGGGGG...',
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '...GG..GG...',
    ],
  },
})

export function buildThemePickerOptions(): ThemePickerOption[] {
  return [
    ...OFFICIAL_THEME_PICKER_OPTIONS,
    ...BASE_PIXEL_THEME_SEEDS.flatMap(seed => [
      {
        label: `${seed.displayName} pixel theme`,
        value: seed.name,
      },
      {
        label: `Light ${seed.displayName} pixel theme`,
        value: `light-${seed.name}`,
      },
    ]),
  ]
}

export function buildPixelSpritePayload(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(BASE_PIXEL_THEME_ROWS).map(([name, rows]) => [
      name,
      PIXEL_MASCOT_GLYPH_OVERRIDES[name]
        ? convertPixelGlyphRowsToPixelRows(PIXEL_MASCOT_GLYPH_OVERRIDES[name]!)
        : normalizePixelRows(rows),
    ]),
  )
}

export function buildPixelStartupPosePayload(): Record<
  string,
  Partial<Record<PixelStartupPose, string[]>>
> {
  return Object.fromEntries(
    Object.entries(PIXEL_STARTUP_POSE_OVERRIDES).map(([name, poseRows]) => [
      name,
      Object.fromEntries(
        Object.entries(poseRows).map(([pose, rows]) => [
          pose,
          pose === 'default' && PIXEL_MASCOT_GLYPH_OVERRIDES[name]
            ? convertPixelGlyphRowsToPixelRows(
                PIXEL_MASCOT_GLYPH_OVERRIDES[name]!,
              )
            : normalizePixelRows(rows),
        ]),
      ),
    ]),
  )
}
