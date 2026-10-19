import { expect, test } from 'claude-code/testing'

// Мод получает цифры лимитов и команда /limit их показывает.
test('показывает лимиты за 5 часов и неделю', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: false } }) as never)
  on('clock.now', async () => ({ value: Date.parse('2026-10-19T12:00:00Z') }) as never)
  const mem = new Map<string, unknown>()
  on('store.get', async ($, e) => ({ value: mem.get((e as { key: string }).key) }) as never)
  on('store.set', async ($, e) => {
    const { key, value } = e as { key: string; value: unknown }
    mem.set(key, value)
    return { value: undefined } as never
  })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.measure', async ($, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { window: 200000 } as never,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-19T20:00:00Z' },
      { kind: 'seven_day', percentUsed: 12.5, resetsAt: '2026-10-23T09:00:00Z' },
    ],
    changed: ['rateLimits'],
  })

  const res = await $.command.run({ command: 'limit', args: '' } as never)
  const text = JSON.stringify(res)
  expect(text).toContain('34%')
  expect(text).toContain('13%')
})
