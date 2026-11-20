import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findOwnAgentCli, readAgentCliVersion, runProcess, stamp } = vi.hoisted(() => ({
  findOwnAgentCli: vi.fn(),
  readAgentCliVersion: vi.fn(),
  runProcess: vi.fn(),
  stamp: vi.fn()
}))

vi.mock('@orca/process-host', () => ({ runProcess }))
vi.mock('./agent-cli-own-install', () => ({ findOwnAgentCli }))
vi.mock('../agent-launch/preflight/agent-cli-version-probe', () => ({ readAgentCliVersion }))
vi.mock('../native-chat/agent-model-catalog/agent-model-catalog-input-stamp', () => ({
  agentModelCatalogInputStamp: stamp
}))
vi.mock('../native-chat/agent-model-catalog/agent-model-catalog-store', () => ({
  agentModelCatalogStore: { expireLaunchScopes: () => {} }
}))
vi.mock('./agent-cli-latest-release', () => ({ latestAgentCliRelease: async () => '2.0.0' }))
vi.mock('./agent-cli-model-requirements', () => ({ readModelsNeedingCliUpdate: async () => [] }))

import { checkAgentCliUpdates, runAgentCliUpdate } from './agent-cli-update-service'

const cliAt = (program: string) => ({
  program,
  realPath: program,
  env: {},
  command: 'claude',
  version: { prefixArgs: [], env: {} }
})

beforeEach(() => {
  vi.clearAllMocks()
  stamp.mockResolvedValue('launcher')
  runProcess.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false })
})

describe('runAgentCliUpdate', () => {
  it('reads the CLI a new chat finds once the update moved it', async () => {
    findOwnAgentCli
      .mockResolvedValueOnce(cliAt('/old/bin/claude'))
      .mockResolvedValueOnce(cliAt('/new/bin/claude'))
    readAgentCliVersion.mockImplementation(async ({ program }) => ({
      version: program === '/new/bin/claude' ? '2.0.0' : '1.0.0'
    }))

    expect(await runAgentCliUpdate('claude', {})).toEqual({ ok: true })
  })

  it('keeps the updated version when a check read the old one during the update', async () => {
    findOwnAgentCli.mockResolvedValue(cliAt('/npm/bin/claude'))
    // npm has replaced the launcher by the time the check looks, but not yet the CLI behind it.
    stamp.mockResolvedValueOnce('old launcher').mockResolvedValue('new launcher')
    let finishUpdate = () => {}
    runProcess.mockReturnValueOnce(
      new Promise((resolve) => {
        finishUpdate = () => resolve({ code: 0, stdout: '', stderr: '', timedOut: false })
      })
    )
    let answerCheck = (_version: string) => {}
    readAgentCliVersion
      .mockResolvedValueOnce({ version: '1.0.0' })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerCheck = (version) => resolve({ version })
        })
      )
      .mockResolvedValueOnce({ version: '2.0.0' })

    const run = runAgentCliUpdate('claude', {})
    await vi.waitFor(() => expect(runProcess).toHaveBeenCalled())
    const check = checkAgentCliUpdates({}, ['claude'])
    await vi.waitFor(() => expect(readAgentCliVersion).toHaveBeenCalledTimes(2))
    finishUpdate()
    expect(await run).toEqual({ ok: true })
    answerCheck('1.0.0')
    await check

    expect(await checkAgentCliUpdates({}, ['claude'])).toEqual([])
  })
})
