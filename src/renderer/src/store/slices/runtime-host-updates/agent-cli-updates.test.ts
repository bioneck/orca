import { describe, expect, it, vi } from 'vitest'
import type { AgentCliUpdate } from '../../../../../shared/agent-launch/installation/agent-cli-update'
import { createTestStore } from '../../testing/app-store-test-fixture'

const { callRuntimeRpc } = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc }))

const behind = (agent: 'claude' | 'codex'): AgentCliUpdate => ({
  agent,
  installedVersion: '1.0.0',
  latestVersion: '2.0.0',
  command: `${agent} update`,
  runnable: true
})

describe('agent CLI updates', () => {
  it('keeps an update gone when a check asked before it answers late', async () => {
    let answerCheck = (_updates: AgentCliUpdate[]) => {}
    callRuntimeRpc.mockImplementation(async (_target, method: string) =>
      method === 'agentCliUpdate.check'
        ? new Promise((resolve) => {
            answerCheck = (updates) => resolve({ updates })
          })
        : { ok: true }
    )
    const store = createTestStore()
    const local = { kind: 'local' } as const

    const check = store.getState().checkAgentCliUpdates(local)
    expect(await store.getState().runAgentCliUpdate(local, 'claude')).toBe(true)
    answerCheck([behind('claude'), behind('codex')])
    await check

    expect(store.getState().agentCliUpdates.get('')?.updates).toEqual([behind('codex')])
  })
})
