/** The experimental agent-organization bundle must carry one parseable Host layer. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('agent organization profile bundle', () => {
  it('declares a public parseable layer containing the registry and its tools', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: { access?: string }
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBeUndefined()
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-experimental-agent-org': 'workspace:*',
      '@deepseek-ai/dsh-experimental-tool-agent-org': 'workspace:*',
    })

    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as { insert?: { id?: string; name?: string; config?: unknown }[] }[]
    const inserted = parsed.flatMap(patch => patch.insert ?? [])
    expect(inserted).toEqual([
      { id: 'agent-org', name: '@deepseek-ai/dsh-experimental-agent-org' },
      { id: 'tool-agent-org', name: '@deepseek-ai/dsh-experimental-tool-agent-org' },
    ])
  })
})
