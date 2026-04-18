import { claudeCode_2_1_112_Adapter } from './adapters/claudeCode_2_1_112.js'
import { hasCurrentPatchFeatures } from './patchRuntime.js'
import type { PatchThemePayload } from './themePayload.js'

export type ClaudeCodePatchContext = {
  installedAt: string
  themePayload: PatchThemePayload
}

export type ClaudeCodePatchStep = (
  source: string,
  context: ClaudeCodePatchContext,
) => string

export type ClaudeCodeAdapter = {
  id: string
  supportedVersions: readonly string[]
  patch(source: string, context: ClaudeCodePatchContext): string
}

export const CLAUDE_CODE_ADAPTERS = Object.freeze([
  claudeCode_2_1_112_Adapter,
]) as readonly ClaudeCodeAdapter[]

export const VALIDATED_CLAUDE_CODE_VERSIONS = Object.freeze(
  CLAUDE_CODE_ADAPTERS.flatMap(adapter => adapter.supportedVersions),
) as readonly string[]

const VALIDATED_CLAUDE_CODE_VERSION_SET = new Set<string>(
  VALIDATED_CLAUDE_CODE_VERSIONS,
)

export function isValidatedClaudeCodeVersion(version: string | null): boolean {
  return version !== null && VALIDATED_CLAUDE_CODE_VERSION_SET.has(version)
}

export function getValidatedVersionSummary(): string {
  return VALIDATED_CLAUDE_CODE_VERSIONS.join(', ')
}

export function getClaudeCodeAdapterForVersion(
  version: string | null | undefined,
): ClaudeCodeAdapter | null {
  if (!version) {
    return null
  }

  return (
    CLAUDE_CODE_ADAPTERS.find(adapter =>
      adapter.supportedVersions.includes(version),
    ) ?? null
  )
}

export function resolveClaudeCodeAdapter(
  version: string | null | undefined,
  allowFallback: boolean,
): ClaudeCodeAdapter {
  const exactAdapter = getClaudeCodeAdapterForVersion(version)
  if (exactAdapter) {
    return exactAdapter
  }

  const latestAdapter = CLAUDE_CODE_ADAPTERS.at(-1)
  if (allowFallback && latestAdapter) {
    return latestAdapter
  }

  throw new Error(
    `No Claude Code patch adapter for ${version ?? 'unknown'}; validated versions: ${getValidatedVersionSummary()}.`,
  )
}

export function applyClaudeCodePatch(
  source: string,
  adapter: ClaudeCodeAdapter,
  context: ClaudeCodePatchContext,
): string {
  const patchedSource = adapter.patch(source, context)
  if (!hasCurrentPatchFeatures(patchedSource)) {
    throw new Error(
      `Claude Code patch adapter ${adapter.id} did not produce a complete Hippocode patch.`,
    )
  }

  return patchedSource
}
