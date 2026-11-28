import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { CAT_FRAMES } from '../hooks/cat-frames'
import { classed } from '../hooks/register'

// The cat keeps up with the work: a failed tool trips it, a long run tires it, and a question put
// to you stops it until you answer.

type Engine = Parameters<TestBody>[0]

const BAND = {
  plugin: 'running-cat',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

async function band($: Engine, isWorking = true): Promise<{ alt: string; source: string }> {
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking } })
  const svg = (await ui.find({ type: 'Svg' })) as { props?: { alt?: string; source?: string } } | undefined
  await ui.unmount()
  return { alt: svg?.props?.alt ?? '', source: svg?.props?.source ?? '' }
}

let row = 0
// A tool's result as the session keeps it, failed or not, in the main loop or a subagent's.
async function result($: Engine, isError: boolean, text = isError ? 'Exit code 1\nFAIL tests/x.test.ts' : 'ok', agentId?: string): Promise<void> {
  row += 1
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${row}`, is_error: isError, content: text }] },
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Bash' },
    uuid: `row-${row}`,
    ...(agentId === undefined ? {} : { agentId }),
  })
}

const ask = ($: Engine) => $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })

// Set going, walked off and into its run (the run starts 0.8 s in).
async function running($: Engine, on: Parameters<TestBody>[1]) {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.PermissionRequest', () => ({}))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(800)
  return clock
}

const has = (svg: string, frames: readonly string[]): boolean => frames.every(f => svg.includes(classed(f)))

test('a tool that fails trips the cat: it brakes flashing red, catches itself, walks on and runs, the park held meanwhile', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await result($, true)

  const tripped = (await band($)).source
  expect(has(tripped, CAT_FRAMES.hurt)).toBe(true)
  expect(has(tripped, CAT_FRAMES.walk)).toBe(true)
  // held where two seconds' run left it (36 px), off again after the trip: 0.44 + 0.72 + 0.48 + 0.8 s
  expect(tripped).toContain('.lp{--h:-36px;animation:lp ')
  expect(tripped).toContain('hold 2.44s}')

  // more failures straight after are the same stumble
  await clock.advance(500)
  await result($, true)
  expect((await band($)).source).toContain('hold 1.94s}')

  // up and running again, the park on from where it stood
  await clock.advance(1_940)
  const again = (await band($)).source
  expect(has(again, CAT_FRAMES.hurt)).toBe(false)
  expect(again).toContain('.lp{animation:lp ')
  expect(again).toContain(`animation-delay:-2s`)
})

test('no trip for a tool that worked, one you refused or cut short, or a subagent\'s failure', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await result($, false)
  await result($, true, "The user doesn't want to proceed with this tool use. The tool use was rejected.")
  await result($, true, '[Request interrupted by user for tool use]')
  await result($, true, 'Exit code 2', 'agent-1')
  const still = (await band($)).source
  expect(has(still, CAT_FRAMES.hurt)).toBe(false)
  expect(still).toContain('.lp{animation:lp ')
})

test('no trip before the cat is running, nor after the task is done', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await result($, true)
  expect(has((await band($, false)).source, CAT_FRAMES.hurt)).toBe(false)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(300)
  await result($, true)
  // still walking off: the walk goes on as set
  expect((await band($)).source).toContain('hold .5s}')
})

test('three minutes running without a stop, the cat stops for breath and sits a moment, then walks on and runs', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(208_000)
  expect((await band($)).source).toContain('.lp{animation:lp ')

  // at the next half-minute tick past three minutes
  await clock.advance(1_200)
  const tired = (await band($)).source
  for (const frames of [CAT_FRAMES.stop, CAT_FRAMES.idle, CAT_FRAMES.sitDown, CAT_FRAMES.sit1, CAT_FRAMES.sitUp, CAT_FRAMES.walk]) {
    expect(has(tired, frames)).toBe(true)
  }
  // a brake 0.56 s, panting 1.68 s, down 0.64 s, a rest 1.12 s, up 0.6 s and a slow walk 1.04 s
  expect(tired).toContain('hold 5.64s}')

  await clock.advance(5_640)
  // and not again for another three minutes
  await clock.advance(160_000)
  expect((await band($)).source).not.toContain('hold ')
})

test('a question put to you stops the cat: it turns to look out and waits, the park still, then runs on once answered', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await ask($)
  // a moment's grace: a hook that answers at once leaves it running
  expect((await band($)).source).toContain('.lp{animation:lp ')

  await clock.advance(1_500)
  const waiting = await band($)
  expect(waiting.alt).toMatch(/waiting for your answer/)
  expect(has(waiting.source, CAT_FRAMES.look.slice(4, 8))).toBe(true)
  // held still and sharp where 3.5 s of running left it
  expect(waiting.source).toContain('.lp{transform:translateX(-63px)}')
  expect(waiting.source).not.toContain('geometricPrecision')

  // however long you take
  await clock.advance(60_000)
  expect((await band($)).alt).toMatch(/waiting for your answer/)

  // answered: the tool ran. It turns back, walks off and runs, from where it stood.
  await result($, false)
  const back = (await band($)).source
  expect(has(back, CAT_FRAMES.look.slice(8))).toBe(true)
  expect(back).toContain('.lp{--h:-63px;animation:lp ')
  expect(back).toContain('hold 1.28s}')
  await clock.advance(1_280)
  expect((await band($)).source).toContain('.lp{animation:lp ')
})

test('a question answered within the grace never stops the cat; one the task ends on leaves it standing', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await ask($)
  await clock.advance(400)
  await result($, false)
  await clock.advance(5_000)
  expect((await band($)).alt).not.toMatch(/waiting/)
  expect((await band($)).source).toContain('.lp{animation:lp ')

  await ask($)
  await clock.advance(2_000)
  expect((await band($)).alt).toMatch(/waiting/)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
  const stood = await band($, false)
  expect(stood.alt).not.toMatch(/your answer/)
  // and the next task sets it going as usual
  await $.prompt.submit({ text: 'again', wait: false, origin: { kind: 'composer' } })
  expect((await band($)).source).toContain(classed(CAT_FRAMES.walk[0]))
})

test('a subagent\'s question is answered by that subagent going on, not by the main loop', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, agent_id: 'agent-1' })
  await clock.advance(1_500)
  await result($, false)
  expect((await band($)).alt).toMatch(/waiting/)
  await result($, false, 'ok', 'agent-1')
  expect((await band($)).alt).not.toMatch(/waiting/)
})

// A tool called, in the main loop or a subagent's: its call's id.
async function call($: Engine, name: string, input: Record<string, unknown> = {}, agentId?: string): Promise<string> {
  row += 1
  const id = `toolu_c${row}`
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    door: 'response',
    origin: { kind: 'model', model: 'claude-opus-5-5' },
    uuid: `row-${row}`,
    ...(agentId === undefined ? {} : { agentId }),
  })
  return id
}

// That call's result.
async function outcome($: Engine, id: string, isError: boolean): Promise<void> {
  row += 1
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? 'Exit code 1\nFAIL' : 'ok' }] },
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Bash' },
    uuid: `row-${row}`,
  })
}

test('tests that pass after failing have the cat jump for joy mid-run, then run on', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await outcome($, await call($, 'Bash', { command: 'npm test' }), true)
  expect(has((await band($)).source, CAT_FRAMES.hurt)).toBe(true)

  await clock.advance(3_000)
  await outcome($, await call($, 'Bash', { command: 'npm test' }), false)
  const joy = (await band($)).source
  expect(has(joy, CAT_FRAMES.jump)).toBe(true)
  expect(has(joy, CAT_FRAMES.hurt)).toBe(false)
  // held while it jumps: a brake, the jump and a walk, then off again
  expect(joy).toMatch(/\.lp\{--h:-[\d.]+px;animation:lp /)

  // passing again is nothing new
  await clock.advance(5_000)
  await outcome($, await call($, 'Bash', { command: 'npm test' }), false)
  const on2 = (await band($)).source
  expect(has(on2, CAT_FRAMES.jump)).toBe(false)
  expect(on2).toContain('.lp{animation:lp ')
})

test('no jump for tests that pass at the first go, nor for other commands that work after a failure', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  await outcome($, await call($, 'Bash', { command: 'pytest -q' }), false)
  expect(has((await band($)).source, CAT_FRAMES.jump)).toBe(false)

  await outcome($, await call($, 'Bash', { command: 'npm run build' }), true)
  await clock.advance(3_000)
  await outcome($, await call($, 'Bash', { command: 'ls' }), false)
  await outcome($, await call($, 'Bash', { command: 'pytest -q' }), false)
  expect(has((await band($)).source, CAT_FRAMES.jump)).toBe(false)
})

test('a subagent at work has a kitten run along behind the cat; done, it turns round and runs off', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  expect((await band($)).source).not.toContain('class="km0"')

  await result($, false, 'ok', 'agent-1')
  const one = await band($)
  expect(one.alt).toMatch(/a kitten with it/)
  expect(one.source).toContain('<g class="km0"><g transform="translate(')
  expect(one.source).toContain('scale(.5)')
  // catching up from behind
  expect(one.source).toMatch(/\.km0\{animation:kj 1\.2s ease-out/)

  await clock.advance(2_000)
  await result($, false, 'ok', 'agent-2')
  const two = await band($)
  expect(two.alt).toMatch(/2 kittens with it/)
  expect(two.source).toContain('class="km1"')
  expect(two.source).not.toMatch(/\.km0\{animation:kj/)

  // agent-1 done: its kitten turns round and runs back off the scene
  await $.turn.complete({ answer: 'found it', durationMs: 1, isAborted: false, turnId: 'sub-1', reason: 'answer', agentId: 'agent-1' })
  const off = await band($)
  expect(off.alt).toMatch(/a kitten with it/)
  expect(off.source).toContain('scale(-.5,.5)')
  expect(off.source).toMatch(/\.km0\{animation:kl 1\.2s ease-in/)
  // and gone
  await clock.advance(1_300)
  const after = (await band($)).source
  expect(after).not.toContain('scale(-.5,.5)')
  expect(after).toContain('class="km0"')
  expect(after).not.toContain('class="km1"')

  // the cat stopped short (a tool failed): the kitten stands by till it runs again
  await result($, true)
  const tripped = (await band($)).source
  expect(tripped).toMatch(/<g class="km0"><g transform="[^"]*"><use class="c ks0" href="#kqs"\/>/)
  expect(tripped).toMatch(/\.ks0\{animation:on 2\.44s step-end\}/)
  expect(tripped).toMatch(/\.kr0\{animation:kon 1ms 2\.44s both\}/)

  // the task done while agent-2 works on in the background: its kitten stands by the cat
  // (well into its run again: an answer straight after a stop has it run on a moment first)
  await clock.advance(5_000)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const stood = await band($, false)
  expect(stood.alt).toMatch(/a kitten with it/)
  expect(stood.source).toContain('<g class="km0"><g transform="translate(')
  expect(stood.source).not.toContain('class="c kf00')
  // and once done, runs off and is gone
  await $.turn.complete({ answer: 'found it', durationMs: 1, isAborted: false, turnId: 'sub-2', reason: 'answer', agentId: 'agent-2' })
  expect((await band($, false)).source).toContain('scale(-.5,.5)')
  await clock.advance(1_300)
  expect((await band($, false)).source).not.toContain('class="km')
})

// Within `eps` of each other (places in a lap: either way round).
function near(a: number, b: number, eps: number, isLap = false): void {
  const d = Math.abs(a - b)
  expect(isLap ? Math.min(d, 1 - d) : d).toBeLessThan(eps)
}

// The path's lap time and where it stands in its lap (0..1), as a drawing has them.
function path(svg: string): { lap: number; at: number } {
  const m = svg.match(/\.lp\{animation:lp ([\d.]+)s linear infinite;animation-delay:-([\d.]+)s\}/)
  expect(m).not.toBeNull()
  const lap = Number(m?.[1])
  return { lap, at: Number(m?.[2]) / lap }
}

test('the cat runs briskly while Claude edits and runs things thick and fast, easy while it only reads, the park on from where it stood', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  const steady = path((await band($)).source)

  for (const tool of ['Edit', 'Bash', 'Edit', 'Write']) await call($, tool, { command: 'x' })
  const brisk = path((await band($)).source)
  near(steady.lap / brisk.lap, 1.4, 0.01)
  // not a jump: where it stood at the change
  near(brisk.at, steady.at, 0.002, true)
  // the cat's legs in time: its run's frames at 71 ms
  expect((await band($)).source).toContain(`fr${CAT_FRAMES.run.length} ${((CAT_FRAMES.run.length * 71) / 1000).toFixed(3).replace(/^0/, '').replace(/0+$/, '')}s`)

  // ten seconds on, ten seconds further at that pace
  await clock.advance(10_000)
  const later = path((await band($)).source)
  near(later.at, (brisk.at + 10 / brisk.lap) % 1, 0.002, true)

  // the work quiet a while: steady again
  await clock.advance(21_000)
  near(path((await band($)).source).lap, steady.lap, 0.01)

  // only reading (a while after the last change: a pace holds 15 s)
  await clock.advance(15_000)
  await call($, 'Read', { file_path: '/a' })
  await call($, 'Grep', { pattern: 'x' })
  near(steady.lap / path((await band($)).source).lap, 0.75, 0.01)
})

test('a pace holds a while before it changes again, so the band is not redrawn with every tool', async ($, on) => {
  const clock = await running($, on)
  await clock.advance(2_000)
  const steady = path((await band($)).source)
  await call($, 'Read', { file_path: '/a' })
  await call($, 'Grep', { pattern: 'x' })
  near(steady.lap / path((await band($)).source).lap, 0.75, 0.01)

  // a burst of edits five seconds on: easy still ...
  await clock.advance(5_000)
  for (const tool of ['Edit', 'Bash', 'Edit', 'Write']) await call($, tool, { command: 'x' })
  near(steady.lap / path((await band($)).source).lap, 0.75, 0.01)
  await clock.advance(9_900)
  near(steady.lap / path((await band($)).source).lap, 0.75, 0.01)
  // ... till the easy pace has held 15 s
  await clock.advance(200)
  near(steady.lap / path((await band($)).source).lap, 1.4, 0.01)
})
