import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { CAT_FRAMES } from '../hooks/cat-frames'
import { classed } from '../hooks/register'
import { CAST, DAY, PARK_AUTUMN_DEFS, PARK_DEFS, PARK_SUMMER_DEFS, PARK_WINTER_DEFS, TRAIN_PERIOD, VISITORS, WALKERS } from '../hooks/park'
import { SEASON, SEASON_START, SPELLS, YEAR, seasonAt, seasonHour, snowDepthAt, solarHour, sunHours, weatherAt } from '../hooks/season'

const BAND = {
  plugin: 'running-cat',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

type Drawn = { props?: { alt?: string; source?: string } } | undefined

async function band($: Parameters<TestBody>[0], isWorking: boolean): Promise<{ alt?: string; source?: string }> {
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking } })
  const svg = (await ui.find({ type: 'Svg' })) as Drawn
  await ui.unmount()

  return { alt: svg?.props?.alt, source: svg?.props?.source }
}

test('the cat sits, runs while working, and lies down after 20 seconds idle', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  expect((await band($, false)).alt).toMatch(/sitting/)
  expect((await band($, true)).alt).toMatch(/running/)

  await clock.advance(19_000)
  expect((await band($, false)).alt).toMatch(/sitting/)

  await clock.advance(2_000)
  expect((await band($, false)).alt).toMatch(/lying/)
  expect((await band($, true)).alt).toMatch(/running/)
})

test('the park scrolls while the cat runs and holds where it stopped', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  // Before any run the park stands at its start.
  expect((await band($, false)).source).toContain('.lp{transform:translateX(-0px)}')

  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  // The cat walks a few steps first, the park held still, and set to move off with the run.
  expect((await band($, true)).source).toContain(`.lp{--h:-0px;animation:lp ${640 / 18}s linear .8s infinite,hold .8s}`)
  await clock.advance(800)
  const running = (await band($, true)).source ?? ''
  // The park glides rather than stepping a pixel at a time, in time with the walkers.
  expect(running).toContain(`.lp{animation:lp ${640 / 18}s linear infinite`)

  // Ten seconds of running at 18, 9 and 4 art px a second.
  await clock.advance(10_000)
  const stopped = (await band($, false)).source ?? ''
  expect(stopped).toContain('.lp{transform:translateX(-180px)}')
  expect(stopped).toContain('.ln{transform:translateX(-90px)}')
  expect(stopped).toContain('.lf{transform:translateX(-40px)}')

  // Running again picks up from there: 180 px in at 18 px/s is 10 s into the loop.
  expect((await band($, true)).source).toContain('animation-delay:-10s')
})

test('people walk in the park and stop by the benches', async ($, on) => {
  mock.clock(on)
  const { source } = await band($, false)
  expect(source).toMatch(/\.w0\{animation:wr /)
  expect(source).toMatch(/\.w1\{animation:wl /)
  // Bench visitors share the wall clock too.
  expect(source).toMatch(/\.v0\{--vd:-[0-9.]+s\}/)
  expect(PARK_DEFS).toContain('class="v v1"')
  // Someone buys a drink, someone photographs the tree, someone reads a phone; a dog walker and a cyclist pass.
  for (const k of [2, 3, 4]) {
    expect(PARK_DEFS).toMatch(new RegExp(`class="v (?:vb )?v${k}"`))
  }
  // The drink buyer goes back the way they came, to the gate.
  expect(source).toMatch(/@keyframes mv2\{0%,[\d.]+%\{translate:(-?\d+)px -4px\}.*100%\{translate:\1px -4px\}\}/)
  expect(source).toMatch(/\.w6\{animation:/)
  expect(source).toMatch(/\.w7\{animation:/)
})

// Where walker `i` stands on screen in a drawn band: x from its animation's name, length and delay.
function walkerX(source: string, i: number): number {
  const m = new RegExp(`\.w${i}\{animation:(wr|wl) ([0-9.]+)s linear -([0-9.]+)s infinite`).exec(source)
  if (m === null) {
    throw new Error(`no walker ${i}`)
  }
  const [, name, seconds, delay] = m
  const done = Number(delay) / Number(seconds)

  return name === 'wr' ? -10 + done * 980 : 970 - done * 980
}

test('walkers keep their place when the park starts or stops, and move with the path', async ($, on) => {
  const clock = mock.clock(on, { now: 123_456 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(7_000)

  const still = (await band($, false)).source ?? ''
  const moving = (await band($, true)).source ?? ''

  for (const i of [0, 1, 2, 3, 4, 5]) {
    // The same instant drawn still or moving puts each walker on the same spot.
    expect(Math.abs(walkerX(still, i) - walkerX(moving, i))).toBeLessThan(0.5)
  }
  // While the path moves left, everyone drifts left on screen, the ones walking left fastest.
  expect(moving).toMatch(/\.w0\{animation:wl /)
  expect(moving).toMatch(/\.w1\{animation:wl /)
  expect(still).toMatch(/\.w0\{animation:wr /)
})

test('every scene stays under the SVG size limit', async ($, on) => {
  mock.clock(on)
  for (const isWorking of [false, true]) {
    expect(((await band($, isWorking)).source ?? '').length).toBeLessThan(131_072)
  }
})

// The delays of the cat's frames in a drawn band, in order.
const catDelays = (source: string): number[] =>
  [...source.matchAll(/\.cf\d+\{animation:[^{}]*?s step-end (?:\d+ |infinite )?(-?[0-9.]+)s/g)].map(m => Number(m[1]))

test('the cat looks around before lying down, and lifts its head before it runs', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(20_000)

  // Just settled: the move starts now, its first frames due at once, the nap loop later.
  const settling = (await band($, false)).source ?? ''
  expect(catDelays(settling)[0]).toBe(0)
  // 0.48 s standing, 1.68 s looking right and 1.68 s left, 0.64 + 0.7 s sitting, 2.16 s lying with
  // its head up, 57.6 s asleep; then it sleeps deeply for good.
  expect(settling).toContain('infinite 64.94s')
  expect(settling).toContain(classed(CAT_FRAMES.lookLeft[1]))
  expect(settling).toContain(classed(CAT_FRAMES.dream[0]))
  expect(settling).toContain('@keyframes fr8')
  // The doze shows one frame twice a round: each turn has its own copy, so neither hides the other.
  expect(CAT_FRAMES.sleep[6]).toBe(CAT_FRAMES.sleep[7])
  expect(settling.split(`">${classed(CAT_FRAMES.sleep[6])}</g>`).length - 1).toBeGreaterThanOrEqual(2)

  // Five seconds on, a redraw carries on from there rather than starting over: the deep sleep is
  // five seconds nearer, and the frames already shown are left out.
  await clock.advance(5_000)
  const later = (await band($, false)).source ?? ''
  expect(later).toContain('infinite 59.94s')
  expect(Math.min(...catDelays(later))).toBeGreaterThan(-0.7)

  // A task wakes it: the head comes up first, then it gets up, has a long stretch, walks off and
  // runs.
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  const waking = (await band($, true)).source ?? ''
  expect(catDelays(waking)[0]).toBe(0)
  expect(waking).toContain('@keyframes fr4')
  expect(waking).toContain(classed(CAT_FRAMES.bowDown[3]))
  expect(waking).toContain(classed(CAT_FRAMES.bowUp[1]))
  expect(waking).toContain(classed(CAT_FRAMES.walk[5]))
  // While it gets up the park holds still, and it moves from where it was once the cat runs:
  // 2.04 s lifting its head, 0.6 s getting up, 0.64 + 0.6 s stretching, 0.8 s walking.
  // The drawing sets the park off itself when the run begins, so it moves on time without a
  // redraw.
  expect(waking).toContain(`.lp{--h:-0px;animation:lp ${640 / 18}s linear 4.68s infinite,hold 4.68s}`)
  expect(waking).toContain('@keyframes hold{')
  await clock.advance(4_000)
  expect((await band($, true)).source).toContain('linear .68s infinite,hold .68s}')
  await clock.advance(680)
  const off = (await band($, true)).source ?? ''
  expect(off).toContain('.lp{animation:lp ')
  expect(off).toContain('animation-delay:-0s')
  expect(waking.length).toBeLessThan(131_072)
  expect(settling.length).toBeLessThan(131_072)
})

test('a cat that was awake walks a few steps, then runs', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1_000)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })

  // eight steps of a walk, a tenth of a second each, then the run's loop
  const walking = (await band($, true)).source ?? ''
  expect(walking).toContain(classed(CAT_FRAMES.walk[0]))
  expect(catDelays(walking)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1])
  expect(walking).toContain('.lp{--h:-0px;animation:lp ')
  expect(walking).toContain('hold .8s}')

  // off it runs, the walk over and left out
  await clock.advance(800)
  const running = (await band($, true)).source ?? ''
  expect(running).not.toMatch(/animation:on /)
  expect(catDelays(running)).toEqual([0, 0.1, 0.2, 0.3])
  expect(running).toContain('.lp{animation:lp ')
  // a message sent while it runs keeps it running: no walk again
  await clock.advance(3_000)
  await $.prompt.submit({ text: 'and this', wait: false, origin: { kind: 'composer' } })
  expect((await band($, true)).source).not.toContain(classed(CAT_FRAMES.walk[0]))
})

test('the terminal gets no cat', async ($) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

// Ends the main task's turn (or a subagent's, given its id) the given way.
async function finish($: Parameters<TestBody>[0], reason: 'answer' | 'aborted', agentId?: string): Promise<void> {
  await $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: reason === 'aborted',
    turnId: 't1',
    reason,
    ...(agentId === undefined ? {} : { agentId }),
  })
}

test('a task done: the cat brakes, jumps for joy, sits a while, then has a scratch', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(5_000)
  await finish($, 'answer')

  const first = (await band($, false)).source ?? ''
  expect(first).toContain(classed(CAT_FRAMES.stop[2]))
  expect(first).toContain(classed(CAT_FRAMES.jump[3]))
  expect(first).toContain(classed(CAT_FRAMES.sit1[2]))
  expect(first).toContain(classed(CAT_FRAMES.idle2[2]))
  expect(first).not.toContain(classed(CAT_FRAMES.scratch[2]))
  expect(first.length).toBeLessThan(131_072)

  // 0.44 s braking, 0.88 s jumping, 10.52 s standing and sitting: then the second part.
  await clock.advance(11_900)
  const second = (await band($, false)).source ?? ''
  expect(second).toContain(classed(CAT_FRAMES.scratch[2]))
  expect(second).toContain(classed(CAT_FRAMES.rise[3]))
  expect(second).not.toContain(classed(CAT_FRAMES.jump[3]))
  expect(second.length).toBeLessThan(131_072)

  // Still well before nap time once the scratch is over.
  await clock.advance(4_500)
  expect((await band($, false)).alt).toMatch(/sitting/)
})

test('a task done before the cat got going: it runs a while first, then brakes and jumps', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  // done while it is still walking off (0.8 s of steps before the run)
  await clock.advance(500)
  await finish($, 'answer')

  // it walks off and runs on, the park moving, though the task is over
  const held = await band($, false)
  expect(held.alt).toMatch(/running/)
  expect(held.source).not.toContain(classed(CAT_FRAMES.jump[3]))
  await clock.advance(1_500)
  expect((await band($, false)).alt).toMatch(/running/)
  // 2 s into its run (0.8 s of walking first): it brakes and jumps for joy
  await clock.advance(900)
  const after = (await band($, false)).source ?? ''
  expect(after).toContain(classed(CAT_FRAMES.stop[2]))
  expect(after).toContain(classed(CAT_FRAMES.jump[3]))
})

test('a new task while a short one is still running on: the cat just keeps running', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1_000)
  await finish($, 'answer')
  await clock.advance(500)
  await $.prompt.submit({ text: 'and this', wait: false, origin: { kind: 'composer' } })
  // past when the first would have stopped: no brake, no walk again
  await clock.advance(3_000)
  const source = (await band($, true)).source ?? ''
  expect(source).not.toContain(classed(CAT_FRAMES.jump[3]))
  expect(source).not.toContain(classed(CAT_FRAMES.walk[0]))
  expect(source).toContain(classed(CAT_FRAMES.run[0]))
  expect(source).toContain('.lp{animation:lp ')
})

test('a band still held on the run a moment after the task ends still sees the jump', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(5_000)
  await finish($, 'answer')
  await clock.advance(1_500)   // longer than braking and the jump take

  const source = (await band($, false)).source ?? ''
  expect(source).toContain(classed(CAT_FRAMES.jump[3]))
  expect(source).toContain(classed(CAT_FRAMES.stop[0]))
})

test('a band out of sight at its half-minute tick is drawn afresh once seen, so it never shows a stale clock', async ($, on) => {
  const clock = mock.clock(on, { now: AT_2AM })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1_000)
  const before = (await band($, false)).source
  // the tick lands at 30 s with nobody looking; the band is seen again two seconds later
  await clock.advance(31_000)
  const after = (await band($, false)).source
  expect(after).not.toBe(before)
  // the day's clock read afresh: half a minute on
  const delay = (svg: string): number => Number(/\.dn\{animation-delay:-([\d.]+)s\}/.exec(svg)?.[1])
  expect(delay(after) - delay(before)).toBeGreaterThan(29)
})

test('every redraw is drawn from now: the app starts a drawing over each time it puts it up', async ($, on) => {
  const clock = mock.clock(on, { now: AT_2AM })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1_000)
  const first = (await band($, false)).source
  // the same moment, the same picture
  expect((await band($, false)).source).toBe(first)
  // a moment on, drawn as things are then, not handed back from before
  await clock.advance(400)
  expect((await band($, false)).source).not.toBe(first)
})

test('a stopped task: the cat brakes but does not jump', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(2_000)
  await finish($, 'aborted')

  // it brakes and flashes red, hurt, three times
  const source = (await band($, false)).source ?? ''
  expect(source).toContain(classed(CAT_FRAMES.stop[2]))
  expect(source).toContain(classed(CAT_FRAMES.hurt[0]))
  expect(source).toMatch(/\.cf\d+\{animation:fr2 \.24s step-end 3 \.44s/)
  expect(source).not.toContain(classed(CAT_FRAMES.jump[3]))
})

test('a subagent finishing does not stop the cat', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(800)   // walking off
  await clock.advance(5_000)
  await finish($, 'answer', 'agent-1')
  await clock.advance(5_000)
  await finish($, 'answer')

  // The whole ten seconds counted as running: the park stops 180 px on.
  expect((await band($, false)).source).toContain('.lp{transform:translateX(-180px)}')
})

test('a fresh session: the cat just stands, sits a while, and stays small', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const source = (await band($, false)).source ?? ''
  expect(source).not.toContain(classed(CAT_FRAMES.stop[2]))
  expect(source).toContain(classed(CAT_FRAMES.sit1[2]))
  expect(source.length).toBeLessThan(131_072)
})

test('a frame the loop shows twice keeps one looping animation per copy', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(20_000)

  const source = (await band($, false)).source ?? ''
  for (const rule of source.match(/\.cf\d+\{animation:[^}]*\}/g) ?? []) {
    expect((rule.match(/infinite/g) ?? []).length).toBeLessThanOrEqual(1)
  }
})

test('the park has its lamps flickering, a fountain, a toilet, and a train on the far line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const source = (await band($, false)).source ?? ''
  expect(source).toContain('class="lamp lamp0"')
  expect(source).toContain('class="lamp lamp2"')
  expect(source).toContain('@keyframes flk{')
  expect(source).toContain('class="fw0"')
  expect(source).toContain('class="wcglow"')
  // The train runs on the wall clock: 1000 s into a 90 s cycle is 10 s in; it goes there, then back.
  expect(source).toContain('class="tr"')
  expect(source).toContain('class="trb"')
  expect(source).toContain('@keyframes trainb{')
  expect(source).toContain('.tr,.trb{animation-delay:-10s}')
})

test('everyone comes out of a gate and goes back in at one, so nobody pops in or out of view', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const source = (await band($, false)).source ?? ''
  // One group of visitors, a tile apart, from one tile before the scene: a visit keeps to its tile.
  expect(source.match(/<use class="u\d" href="#vis"/g)?.length).toBe(4)
  expect(source).toContain('<use class="u0" href="#vis" x="-640"/>')
  // Every walk on a stage starts and ends in a gate (x 92 of each tile): up its stairs at the path's
  // back edge in the opening, a step straight down onto the path and out to the stop; back the
  // same way into the opening, a step straight up to the edge, down the stairs. Never along the
  // edge, nor a slant.
  let walks = 0
  for (const [, stage, sub, name] of source.matchAll(/\.v(\d+)(?: \.(\w+))?\{animation:(mv\w+) /g)) {
    const frames = source.match(new RegExp(`@keyframes ${name}\{(.*?)\}\}`))![1]!
    const at = [...frames.matchAll(/\{translate:(-?\d+)(?:px)?(?: (-?\d+)(?:px)?)?(?:\}|$)/g)].map(m => `${m[1]}${m[2] === undefined ? '' : ` ${m[2]}`}`)
    const d = Number.parseInt(at[0]!)
    expect([name, at]).toEqual([name, [`${d} -4`, `${d} 0`, '0', `${d} 0`, `${d} -4`]])
    // the stairs: the walk comes up them from out of sight, and goes down them out of sight again
    const sink = source.match(new RegExp(`@keyframes s${name.slice(1)}\{(.*?)\}\}`))![1]!
    expect([name, [...sink.matchAll(/translate:([^}]*)/g)].map(m => m[1])]).toEqual([name, ['0 26px', '0', '0 26px']])
    const group = sub === undefined ? `<g class="v v${stage}">` : `<g class="${sub}">`
    const x = Number(/<g class="vw"><g transform="translate\((\d+),19\)"/.exec(PARK_DEFS.slice(PARK_DEFS.indexOf(group)))![1])
    expect([name, (((x + d) % 640) + 640) % 640]).toEqual([name, 92])
    // hidden till they come up; at the end they turn their back to the gate, go down, and are gone;
    // cut off under their feet only while on the stairs
    const vars = source.match(new RegExp(`@keyframes w${name.slice(1)}\{(.*?)\}\}`))![1]!
    expect(vars).toMatch(/^[\d.]+%\{--k:url\(#gk\);--o:1;/)
    expect(vars).toMatch(/[\d.]+%\{--k:none\}/)
    expect(vars).toMatch(/[\d.]+%\{--bk:1;--k:url\(#gk\)\}[\d.]+%\{--o:0$/)
    walks++
  }
  // The stairs' cut: just under the feet of whoever is on them (feet on row 40 of their group).
  expect(source).toContain('<clipPath id="gk"><rect x="-999" y="-99" width="2999" height="140"/></clipPath>')
  expect(source).not.toContain('fill="url(#park)"/><rect class="dlt dn" x="85"')
  expect(walks).toBeGreaterThanOrEqual(10)
  // Each walk has its back pose, shown while turned to the gate (or a door).
  expect(source).toMatch(/<g id="wk2" class="pp2"><g class="wks">.*?<\/g><g class="bkp">/)
  expect(source).toContain('.wks{opacity:calc(1 - var(--bk,0))}')
  expect(source).toContain('.bkp{opacity:var(--bk,0)}')
})

for (const when of [0, 1, 2]) test(`a drawing carries only the visitors its plan shows: each one drawn costs the app to put up (${when})`, async ($, on) => {
  {
    const source = await sceneAt($, on, [AT_NOON, AT_2AM, AT_NOON + 7_777_000][when]!)
    // (the petals' defs follow the visitors' in spring; out of it, the rest of the defs)
    const pet = source.indexOf('<g id="pet">')
    const vis = source.slice(source.indexOf('<g id="vis">'), pet >= 0 ? pet : source.indexOf('</defs>'))
    let people = 0
    for (const { i } of VISITORS) {
      // who the plan puts on stage i, in any copy
      const planned = new Set<string>()
      for (const [, frames] of source.matchAll(new RegExp(`@keyframes h${i}u\\d\\{(.*?)\\}\\}`, 'g'))) {
        for (const [, w] of frames!.matchAll(/--w:(\d+)/g)) if (w !== '0') planned.add(w!)
      }
      const at = vis.indexOf(`<g class="h${i}">`)
      if (planned.size === 0) {
        expect([i, at]).toEqual([i, -1])
        continue
      }
      const stage = vis.slice(at, vis.indexOf('<g class="h', at + 5) < 0 ? undefined : vis.indexOf('<g class="h', at + 5))
      const drawn = new Set([...stage.matchAll(/<use class="k(\d+)" href="#wk\d+"\/>/g)].map(m => m[1]!))
      expect([i, [...drawn].sort()]).toEqual([i, [...planned].sort()])
      people += drawn.size
    }
    // far fewer than everyone who might come (a busy noon has a little over half of them)
    expect(people).toBeLessThan((PARK_DEFS.match(/<use class="k\d+" href="#wk/g) ?? []).length * 0.6)
  }
})

test('two people meet, talk a while, then part, each back to their own gate', async ($, on) => {
  const source = await sceneAt($, on, AT_NOON)
  expect(VISITORS.find(v => v.action === 'talk')?.people).toEqual([8, 9])
  const x = (name: string) => [...source.match(new RegExp(`@keyframes ${name}\{(.*?)\}\}`))![1]!.matchAll(/([\d.]+)%\{translate:(-?\d+)/g)]
  const a = x('mv8ta')
  const b = x('mv8tb')
  // one from the left gate, one from the right
  expect(Number(a[0]![2])).toBeLessThan(0)
  expect(Number(b[0]![2])).toBeGreaterThan(0)
  // they reach each other at the same moment and set off again together
  const met = (f: RegExpMatchArray[]) => f.filter(m => m[2] === '0').map(m => m[1])
  expect(met(a)).toEqual(met(b))
  // face to face, hands going as they talk
  expect(source).toMatch(/<g class="ta"><g class="vw">.*?<g class="vs"><g transform="translate\(466,19\)">.*?class="talk0"/)
  expect(source).toMatch(/<g class="tb"><g class="vw">.*?<g class="vs"><g transform="translate\(488,19\) scale\(-1,1\)">.*?class="talk1"/)
})

test('someone pops into the toilet, someone plays on their phone on a bench, the fountain flows', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const source = (await band($, false)).source ?? ''
  // The toilet visitor has nothing to show while inside; the phone player's screen flickers.
  // Two doors: men go in on the left, women on the right; the toilet visitor shows nothing inside.
  expect(PARK_DEFS).toMatch(/class="v v5"><g class="dl"><g class="dh">.*?<g class="do">.*?<g class="ds">.*?<\/g><\/g><g class="dr"><g class="dh">/)
  expect(PARK_DEFS).toMatch(/<g class="tm"><g class="vw"><g transform="translate\(\d+,19\)"><use class="k1" href="#wk5"\/><use class="k2" href="#wk7"\/><\/g><\/g><\/g>/)
  expect(PARK_DEFS).toMatch(/<g class="tf"><g class="vw"><g transform="translate\(\d+,19\)"><use class="k3" href="#wk4"\/><use class="k4" href="#wk3"\/><\/g><\/g><\/g>/)
  expect(source).toContain('.dl{opacity:clamp(0,(3 - var(--w))*var(--w),1)}.dr{opacity:clamp(0,var(--w) - 2,1)}')
  // Each turns to the door first; it opens only then, and they step in.
  for (const g of ['tm', 'tf']) {
    const [, turn, gone] = source.match(new RegExp(`@keyframes wv5${g}\\{.*?([\\d.]+)%\\{--bk:1\\}([\\d.]+)%\\{--o:0`))!.map(Number)
    const opens = Number(source.match(/@keyframes do5\{0%\{opacity:0\}([\d.]+)%/)![1])
    expect([g, turn < opens, opens < gone]).toEqual([g, true, true])
  }
  // The door, held still against the walk: half open, open as they reach it, shut while they are
  // inside, open again to let them out; ajar (the park's own drawing) the rest of the time.
  expect(source).toMatch(/\.v5 \.do\{animation:do5 [\d.]+s step-end var\(--vd\) infinite\}/)
  expect(source).toMatch(/@keyframes ds5\{0%\{opacity:0\}[\d.]+%\{opacity:1\}[\d.]+%\{opacity:0\}\}/)
  expect(source).toMatch(/@keyframes do5\{0%\{opacity:0\}([\d.]+%\{opacity:[01]\}){4}\}/)
  expect(PARK_DEFS).toMatch(/class="v v6">.*?class="vs"><g transform="translate\(135,22\)">.*?class="blink"/)
  // The fountain's glint runs along the arcs in three frames (in the art: the scene here is a
  // winter's, with the fountain off).
  expect(PARK_DEFS).toContain('class="fw2"')
  expect(source).toContain('@keyframes f3{')
})

test('someone sits up straight on the second bench, facing out, without blinking', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const source = (await band($, false)).source ?? ''
  const v7 = PARK_DEFS.slice(PARK_DEFS.indexOf('class="v v7">'))
  expect(v7).toMatch(/^class="v v7">.*?class="vs"><g transform="translate\(405,22\)">/)
  // up to the next stage
  expect(v7.slice(0, v7.indexOf('<g class="h'))).not.toContain('blink')
})

// The park's day is 1440 s: 60 s an hour. 2 a.m. and noon, a whole number of days in.
const AT_2AM = (1440 * 1000 + 120) * 1000
const AT_NOON = (1440 * 1000 + 720) * 1000

async function sceneAt($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], now: number): Promise<string> {
  const clock = mock.clock(on, { now })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  return (await band($, false)).source ?? ''
}

test('a day goes round: sky, sun and moon, a clock, lamps on by night', async ($, on) => {
  const source = await sceneAt($, on, AT_2AM)
  expect(source).toContain('class="sun dn"')
  expect(source).toContain('class="moon dn"')
  expect(source).toContain('class="dsky dn"')
  expect(source).toContain('class="hrs dn"')
  expect(source).toContain('class="nl dn"')
  expect(source).toContain('.dn{animation-delay:-120s}')
})

test('at night fewer people are out, and they come and go only at the turn of a lap', async ($, on) => {
  const source = await sceneAt($, on, AT_2AM)
  // Out from 6 to 23: off now; out all hours: on now (here all night: the lap they start as the
  // night's shower does sets off in it, so they take their umbrella and need not run)
  expect(source).toMatch(/@keyframes wn0\{0%\{opacity:0\}/)
  expect(source).not.toMatch(/@keyframes wn1\{0%\{opacity:0\}/)
  expect(source).toMatch(/\.ww1\{animation:ww1 /)
  // In the copies on screen only the night owls visit: the drink buyer, the reader in pink, the
  // phone player.
  const night = [CAST.indexOf('red'), CAST.indexOf('pink'), CAST.indexOf('cap')]
  for (const t of [0, 30, 60]) for (const p of onStages(source, t, [1, 2])) expect(night).toContain(p)
  expect(source).toContain('{--w:0;animation:360s step-end forwards}')
  expect(source).toContain('svg{--P:2880s step-end infinite}')
})

test('at noon everyone is out', async ($, on) => {
  const source = await sceneAt($, on, AT_NOON)
  expect(source).toMatch(/@keyframes wn0\{0%\{opacity:1\}/)
  const seen = new Set([0, 60, 120, 180, 240, 300].flatMap(t => onStages(source, t)))
  expect(seen.size).toBeGreaterThanOrEqual(5)
})

test('each visit someone picks what to do: the same bench has different people on it', async ($, on) => {
  const clock = mock.clock(on, { now: AT_NOON })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const sitters = new Set<number>()
  for (let step = 0; step < 12; step++) {
    const source = (await band($, false)).source ?? ''
    for (const s of [0, 1]) {
      for (let c = 0; c <= 4; c++) {
        const w = planned(source, `h${s}u${c}`, 0)
        if (w > 0) sitters.add(VISITORS[s]!.people[w - 1]!)
      }
    }
    await clock.advance(120_000)
  }
  expect(sitters.size).toBeGreaterThanOrEqual(3)
})

// Who is on the park's stages, in every copy, `seconds` after the redraw: their CAST indexes.
function onStages(source: string, seconds: number, copies = [0, 1, 2, 3, 4]): number[] {
  return VISITORS.flatMap(({ i, people }) =>
    copies.map(c => planned(source, `h${i}u${c}`, seconds)).filter(w => w > 0).map(w => people[w - 1] as number),
  )
}

// What a plan written at a redraw gives `seconds` later: the last mark at or before then. A
// walker (wn<i>): opacity, over 2880 s. A stage's copy (h<i>u<c>): who is there, the variant
// number --w (0: nobody), over the 360 s the redraw plans ahead.
function planned(source: string, name: string, seconds: number): number {
  const plan = name
  const at = seconds
  const copy = name.match(/^h(\d+)u(\d)$/)
  if (copy !== null) {
    const vars = source.match(new RegExp(`\\.u${copy[2]}\\{([^}]*)\\}`))?.[1] ?? ''
    const own = vars.match(new RegExp(`--h${copy[1]}:(\\w+)`))?.[1]
    if (own === undefined || seconds >= 360) return 0
    const frames = source.match(new RegExp(`@keyframes ${own}\\{(.*?)\\}\\}`))?.[1]
    if (frames === undefined) return -1
    let w = 0
    for (const [, pct, n] of frames.matchAll(/([\d.]+)%\{--w:(\d+)/g)) {
      if ((Number(pct) / 100) * 360 <= seconds + 0.05) w = Number(n)
    }
    return w
  }
  const body = source.match(new RegExp(`@keyframes ${plan}\\{(.*?)\\}\\}`))?.[1]
  if (body === undefined) return name.startsWith('wn') ? 1 : -1
  let value = 1
  for (const [, pct, op] of body.matchAll(/([\d.]+)%\{opacity:(\d)/g)) {
    // marks are rounded to 0.001% (under 0.03 s): read just after `at`, as a redraw then would
    if ((Number(pct) / 100) * 2880 <= at + 0.05) value = Number(op)
  }
  return value
}

test('a later redraw keeps everyone as the earlier one planned, through the evening', async ($, on) => {
  const start = (1440 * 1000 + 1230) * 1000 // 20:30, people going home
  const clock = mock.clock(on, { now: start })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const first = (await band($, false)).source ?? ''
  const names = [
    ...[...first.matchAll(/@keyframes (wn\d+)\{/g)].map(m => m[1]),
    ...VISITORS.flatMap(({ i }) => [0, 1, 2, 3, 4].map(c => `h${i}u${c}`)),
  ]
  expect(names.length).toBeGreaterThan(5)
  // every name resolves to a plan (0 or 1), so the comparison below is not -1 against -1
  for (const name of names) expect([name, planned(first, name, 0) >= 0]).toEqual([name, true])

  // as far as the first redraw planned ahead
  for (let step = 1; step * 37 < 359; step++) {
    await clock.advance(37_000)
    const later = (await band($, false)).source ?? ''
    for (const name of names) {
      expect([name, planned(later, name, 0)]).toEqual([name, planned(first, name, step * 37)])
    }
  }
})

test('the band has round corners, like its frame', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await band($, false)).source).toContain('<style>svg{clip-path:inset(0 round 10px)}')
  expect((await band($, true)).source).toContain('<style>svg{clip-path:inset(0 round 10px)}')
})

test('people glide with the park, and a still park rests on a whole screen pixel', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  // a still park is drawn sharp: smoothed, a person's pixels part where two colours meet
  expect((await band($, false)).source).not.toContain('geometricPrecision')
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1_000)
  expect((await band($, true)).source).toContain('.lp,.w{shape-rendering:geometricPrecision}')
  // 1.234 s at 18 art px a second (after 0.8 s walking off) is 22.212 px: held at 22, a whole
  // screen pixel.
  await clock.advance(1_034)
  const held = (await band($, false)).source?.match(/\.lp\{transform:translateX\(-([\d.]+)px\)\}/)?.[1]
  expect(held).toBe('22')
})

test('late at night no trains run and most windows go dark', async ($, on) => {
  const source = await sceneAt($, on, AT_2AM)
  // The line hides from 0h to 6h; a day and six hours are whole train cycles, so no train is cut.
  expect(source).toContain('<g class="ntr dn"><g class="tr">')
  expect(source).toContain('@keyframes ntr{0%{opacity:0}25%{opacity:1}100%{opacity:1}}')
  expect(DAY % TRAIN_PERIOD).toBe(0)
  expect((DAY / 4) % TRAIN_PERIOD).toBe(0)
  // Windows go dark in three groups on their own hours.
  for (const k of [0, 1, 2]) expect(source).toContain(`class="lw${k} dn"`)
})

test('by day most windows are dark too', async ($, on) => {
  const source = await sceneAt($, on, AT_NOON)
  // The first group: dark till 5:30, lit till 7, dark by day, lit from 17:30 to 23:30.
  expect(source).toContain('@keyframes lw0{0%{opacity:0}22.917%{opacity:1}29.167%{opacity:0}72.917%{opacity:1}97.917%{opacity:0}')
})

test('office workers and students walk through in the rush hours, and only then', async ($, on) => {
  const rush = WALKERS.filter(w => JSON.stringify(w.hours) === '[[6.75,8.25],[16.75,18.25]]')
  expect(rush.length).toBe(7)
  const source = await sceneAt($, on, AT_NOON)
  // At noon none is out: each one's plan starts off.
  for (const { i } of rush) expect(source).toMatch(new RegExp(`@keyframes wn${i}\{0%\{opacity:0\}`))
})

// A weather layer's opacity as a drawing starts: held, or the first mark of its fade.
const startsAt = (source: string, cls: string): string | undefined =>
  source.match(new RegExp(`\\.${cls}\\{opacity:([\\d.]+)\\}`))?.[1] ?? source.match(new RegExp(`@keyframes ${cls}x\\{0%\\{opacity:([\\d.]+)\\}`))?.[1]

// Scenes at several times, in order, on one clock.
async function scenesAt($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], times: number[]): Promise<string[]> {
  const clock = mock.clock(on, { now: times[0]! })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const out: string[] = []
  let now = times[0]!
  for (const t of times) {
    await clock.advance(t - now)
    now = t
    out.push((await band($, false)).source ?? '')
  }
  return out
}

// The start of a spring (4 a.m. on its first day), and times into each season.
const SPRING = Math.floor((1440 * 1000) / YEAR) * YEAR + SEASON_START
const inSeason = (k: number, hours: number): number => (SPRING + k * SEASON + hours * 60) * 1000
// 17h on spring's first day: in its afternoon drizzle (hours 11 to 15 into the season).
const IN_RAIN = inSeason(0, 13)

test('the park has a year: four seasons of four days, each turning at 4 in the morning', () => {
  expect(SEASON).toBe(4 * DAY)
  expect(YEAR).toBe(4 * SEASON)
  expect(['spring', 'summer', 'autumn', 'winter'].map((_, k) => seasonAt(inSeason(k, 0.5) / 1000))).toEqual(['spring', 'summer', 'autumn', 'winter'])
  // a season starts at 4 a.m.: just before, it is still the last one
  expect(seasonAt(inSeason(1, -0.1) / 1000)).toBe('spring')
  expect(((SPRING % DAY) / DAY) * 24).toBe(4)
  expect(Math.abs(seasonHour(inSeason(2, 30) / 1000) - 30)).toBeLessThan(1e-6)
  // each season's weather: rain but for winter, which has snow and a short blizzard or two
  expect(new Set(Object.values(SPELLS.spring).map(s => s[2]))).toEqual(new Set(['rain']))
  expect(new Set(Object.values(SPELLS.winter).map(s => s[2]))).toEqual(new Set(['snow', 'blizzard']))
  for (const [from, to, w] of SPELLS.winter) if (w === 'blizzard') expect(to - from).toBeLessThanOrEqual(1)
  expect(SPELLS.summer.length).toBeGreaterThan(SPELLS.spring.length)
  expect(SPELLS.autumn.length).toBeLessThan(SPELLS.spring.length)
})

test('it rains on the season clock: streaks and splashes only while a shower is due', async ($, on) => {
  const [wet, dry] = await scenesAt($, on, [IN_RAIN, inSeason(0, 40)])
  expect(wet).toContain('class="rain wx"')
  expect(startsAt(wet!, 'rain')).toBe('1')
  expect(startsAt(wet!, 'rcl')).toBe('.7')
  // a dry spring afternoon, no shower for hours: no rain drawn at all, nor its patterns
  expect(dry).not.toContain('class="rain wx"')
  expect(dry).not.toContain('id="rf"')
  expect(dry).toContain('.rcl{opacity:0}')
})

test('a shower coming fades in on the drawing\'s own clock', async ($, on) => {
  // two minutes before spring's first drizzle: the drawing plans it in
  const source = await sceneAt($, on, inSeason(0, 11) - 120_000)
  expect(source).toContain('class="rain wx"')
  expect(source).toMatch(/\.rain\{animation:rainx 600s linear forwards\}@keyframes rainx\{0%\{opacity:0\}20%\{opacity:0\}22\.5%\{opacity:1\}/)
})

test('spring has its blossom and falling petals; summer is green, autumn red with leaves blowing, winter snowy', async ($, on) => {
  const [spring, summer, autumn, winter] = await scenesAt($, on, [0, 1, 2, 3].map(k => inSeason(k, 20)))
  expect(spring).toContain('href="#pet"')
  expect(spring).not.toContain('url(#lf)')
  expect(spring).not.toContain('[stroke="#ff9cc8"]')
  expect(summer).not.toContain('href="#pet"')
  expect(summer).not.toContain('id="pet"')
  expect(summer).toContain('[stroke="#ff9cc8"]{stroke:#44a058}')
  expect(autumn).toContain('[stroke="#ff9cc8"]{stroke:#e0603a}')
  expect(autumn).toContain('<g class="lfa"><rect y="-88" width="1120" height="132" fill="url(#lf)"/></g>')
  expect(autumn).toContain('<pattern id="lf"')
  expect(winter).toContain('[stroke="#ff9cc8"]{stroke:none}')
  expect(winter).not.toContain('url(#lf)')
})

test('winter: the cherry tree stands bare under snow, and everyone wears a hat and a scarf', async ($, on) => {
  const [autumn, winter] = await scenesAt($, on, [inSeason(2, 20), inSeason(3, 20)])
  // the crown's five colours hidden, the bare limbs (class wtr) drawn only now
  expect(winter).toContain('[stroke="#ff9cc8"]{stroke:none}')
  expect((winter.match(/\{(stroke:none|fill:none!important)\}/g) ?? []).length).toBeGreaterThanOrEqual(5)
  expect(winter).toContain('<g class="wtr">')
  expect(autumn).not.toContain('<g class="wtr">')
  // the winter templates swapped in for the same ids, and their colours: hat, scarf, sleeves, tights
  const ids = [...PARK_WINTER_DEFS.matchAll(/<g id="(\w+)">/g)].map(m => m[1]!)
  expect(ids.length).toBeGreaterThan(20)
  expect(winter).toContain('class="cw2"')
  expect(winter).toContain('class="cn2"')
  expect(autumn).not.toContain('class="cn2"')
  expect(winter).toContain('.ca2{stroke:color-mix(in srgb,var(--j2,var(--J,var(--a2))) 80%,#000)}')
  expect(winter).toMatch(/\.w0\{--w2:#[0-9a-f]{6};--n2:#[0-9a-f]{6}\}/)
  expect(winter).toMatch(/\.pp0\{--w2:#[0-9a-f]{6};--n2:#[0-9a-f]{6}\}/)
  for (const id of ids) expect([id, (winter.match(new RegExp(`<g id="${id}">`, 'g')) ?? []).length]).toEqual([id, 1])
})

test('summer wears short sleeves and white shirts, autumn long sleeves and thin scarves, spring as drawn', async ($, on) => {
  const [spring, summer, autumn] = await scenesAt($, on, [0, 1, 2].map(k => inSeason(k, 10)))
  const defs = (markup: string): Map<string, string> => new Map([...classed(markup).matchAll(/<g id="(\w+)">(.*?)<\/g>/g)].map(m => [m[1]!, m[0]] as const))
  const own = defs(PARK_DEFS)
  for (const [name, season, dressed] of [['summer', summer, PARK_SUMMER_DEFS], ['autumn', autumn, PARK_AUTUMN_DEFS]] as const) {
    const swaps = defs(dressed)
    expect([name, swaps.size > 10]).toEqual([name, true])
    // each dressed template in place of its own, under the same id, and spring keeps its own
    for (const [id, art] of swaps) {
      expect([name, id, season.includes(art), (season.match(new RegExp(`<g id="${id}">`, 'g')) ?? []).length]).toEqual([name, id, true, 1])
      if (own.has(id)) expect([id, spring.includes(own.get(id)!)]).toEqual([id, true])
    }
  }
  // summer: bare arms below the shoulder, no coat hems, the office's sleeves white
  expect(PARK_SUMMER_DEFS).toMatch(/<g id="\w+"><\/g>/)
  expect(summer).toContain('.cW{stroke:var(--W,#f3f0fb)}')
  expect(summer).toMatch(/\.w\d+ use(,\.w\d+ use)*\{--a2:#f3f0fb\}/)
  expect(spring).not.toContain('{--a2:#f3f0fb}')
  // autumn: a scarf for every other person, the bare neck for the rest; long sleeves
  expect(autumn).toContain('.cw2{stroke:var(--w2,var(--S))}')
  expect(autumn).toContain('.ca2{stroke:var(--j2,var(--J,var(--a2)))}')
  expect(autumn).toMatch(/\.w0\{--w2:#[0-9a-f]{6}\}/)
  expect(autumn).not.toMatch(/\.w1\{--w2:/)
  for (const other of [spring, summer]) expect(other).not.toContain('class="cw2"')
})

test('the days are long in summer and short in winter, turning smoothly through the year', () => {
  const at = (k: number, day: number): number => SEASON_START + k * SEASON + day * DAY
  const length = (t: number): number => sunHours(t)[1] - sunHours(t)[0]
  // longest at midsummer, shortest at midwinter, twelve hours half way through spring and autumn
  expect(length(at(1, 2)).toFixed(1)).toBe('14.4')
  expect(length(at(3, 2)).toFixed(1)).toBe('9.6')
  expect(length(at(0, 2)).toFixed(1)).toBe('12.0')
  expect(length(at(2, 2)).toFixed(1)).toBe('12.0')
  // noon at 11:45 every day: summer up before 5 and down near 7, winter up near 7 and down at 4:30
  for (const k of [0, 1, 2, 3]) expect(((sunHours(at(k, 1))[0] + sunHours(at(k, 1))[1]) / 2).toFixed(2)).toBe('11.75')
  expect(sunHours(at(1, 2))[0]).toBeLessThan(5)
  expect(sunHours(at(1, 2))[1]).toBeGreaterThan(18.9)
  expect(sunHours(at(3, 2))[0]).toBeGreaterThan(6.9)
  expect(sunHours(at(3, 2))[1]).toBeLessThan(16.6)
  // no jump from one season into the next, nor from one minute to the next
  for (const k of [1, 2, 3, 4]) expect(Math.abs(length(at(k, 0) - 1) - length(at(k, 0) + 1))).toBeLessThan(0.001)
  // a forced season has the days of that season at the same point in it
  expect(sunHours(at(0, 2), { season: 'winter' })).toEqual(sunHours(at(3, 2)))
  // the art's day (sun up at 6, down at 18) moved to fit: midnight kept, the ends on the sun's
  expect(solarHour(0, 4.5, 19)).toBe(0)
  expect(solarHour(6, 4.5, 19)).toBe(4.5)
  expect(solarHour(12, 4.5, 19)).toBe(11.75)
  expect(solarHour(18, 4.5, 19)).toBe(19)
  expect(solarHour(24, 4.5, 19)).toBe(24)
})

test('the sky, the sun and moon, the lamps and the fireflies keep the sun\'s hours; the clock keeps the clock\'s', async ($, on) => {
  const [summer, winter] = await scenesAt($, on, [inSeason(1, 30), inSeason(3, 30)])
  const marks = (svg: string, name: string): number[] =>
    [...(svg.match(new RegExp(`@keyframes ${name}\\{((?:[\\d.]+%\\{[^}]*\\})*)\\}`))?.[1] ?? '').matchAll(/([\d.]+)%\{/g)].map(m => Number(m[1]))
  const hour = (pct: number): number => (pct / 100) * 24
  // the sun comes up (its first mark in sight) at the day's sunrise, and goes down at sunset
  for (const [svg, t] of [[summer, inSeason(1, 30)], [winter, inSeason(3, 30)]] as const) {
    const [rise, set] = sunHours(t / 1000)
    const sun = marks(svg, 'sun')
    expect(Math.abs(hour(sun[2]!) - rise)).toBeLessThan(0.06)
    expect(Math.abs(hour(sun[sun.length - 3]!) - set)).toBeLessThan(0.06)
  }
  // the lamps go off later on a winter morning, and come on earlier in a winter evening
  const [, sOff, sOn] = marks(summer, 'nl')
  const [, wOff, wOn] = marks(winter, 'nl')
  expect(wOff!).toBeGreaterThan(sOff! + 5)
  expect(wOn!).toBeLessThan(sOn! - 5)
  // the full day sky comes earlier and stays later in summer
  expect(marks(summer, 'dsky')[2]!).toBeLessThan(marks(winter, 'dsky')[2]!)
  expect(marks(summer, 'dsky')[3]!).toBeGreaterThan(marks(winter, 'dsky')[3]!)
  // the clock, the windows and the train as drawn
  for (const svg of [summer, winter]) {
    expect(svg).toContain('@keyframes hrs{0%{transform:translateY(0)}')
    expect(marks(svg, 'lw0')).toEqual(marks(summer, 'lw0'))
    expect(marks(svg, 'ntr')).toEqual([0, 25, 100])
  }
})

test('the colours turn to the next season\'s over its last two hours', async ($, on) => {
  // an hour before summer: half way from spring's pink to summer's green
  const [early, half] = await scenesAt($, on, [inSeason(1, -3), inSeason(1, -1)])
  expect(early).not.toContain('[stroke="#ff9cc8"]')
  expect(half).toContain('[stroke="#ff9cc8"]{stroke:#a29e90}')
})

test('winter: snow lies on things, building up as it snows and melting slowly between', async ($, on) => {
  // none at the start, full 3 hours into the first snowfall, half gone 8 hours after it ends
  expect(snowDepthAt(0)).toBe(0)
  expect(snowDepthAt(6)).toBe(0)
  expect(snowDepthAt(7.5)).toBe(0.5)
  expect(snowDepthAt(9)).toBe(1)
  expect(snowDepthAt(15 + 8)).toBe(0.5)
  // it seldom melts away before the next: a little is left when the second comes
  expect(snowDepthAt(30)).toBe(0.0625)
  // drawn in winter only: the dusting and the cover, melting over the drawing's window (20h: the
  // first snowfall over five hours, about two thirds lying)
  const [autumn, winter] = await scenesAt($, on, [inSeason(2, 20), inSeason(3, 20)])
  for (const cls of ['sg1', 'sg2']) {
    expect(winter).toContain(`<g class="${cls}">`)
    expect(autumn).not.toContain(`<g class="${cls}">`)
  }
  expect(winter).toMatch(/@keyframes sg1x\{0%\{opacity:1\}/)
  expect(winter).toMatch(/@keyframes sg2x\{0%\{opacity:\.5\d\}/)
  // the flowers asleep and the fountain off; the cyclist's scarf; clothes a fifth darker
  for (const cls of ['flw', 'fjet', 'fw0']) {
    expect(winter).not.toContain(`<g class="${cls}">`)
    expect(autumn).toContain(`<g class="${cls}">`)
  }
  // (the hidden crown not drawn at all)
  expect(winter.length).toBeLessThan(autumn.length - 2000)
  expect(winter).toContain('.wsc{display:inline}')
  expect(winter).toContain('.cJ{stroke:color-mix(in srgb,var(--J) 80%,#000)}')
  expect(autumn).not.toContain('color-mix')
  expect(winter).toMatch(/\.w7 (\.k\w+|\[stroke="#2fb59a"\])\{stroke:#26917b\}/)
  expect(winter).toMatch(/(\.k\w+|\[stroke="#36b8e3"\])\{stroke:#a8d4e8\}/)
})

test('winter snows: flakes falling through the park, and people still come out in light snow', async ($, on) => {
  // (a spell of snow with no blizzard near it)
  const [from, to] = SPELLS.winter.find(s => s[2] === 'snow' && s[0] === 30)!
  const at = inSeason(3, (from + to) / 2)
  expect(weatherAt(at / 1000)).toBe('snow')
  const source = await sceneAt($, on, at)
  expect(source).toContain('<g class="snw">')
  expect(source).toContain('<pattern id="sn"')
  expect(startsAt(source, 'snw')).toBe('1')
  expect(source).not.toContain('class="rain wx"')
  expect(source).not.toContain('<g class="bzw">')
  // light snow keeps nobody in: someone is planned on some stage
  expect(source).toMatch(/%\{--w:[1-9]\}/)
})

test('whoever sits on a bench is drawn before anyone walking: passers-by go in front of them', () => {
  const order = [...PARK_DEFS.matchAll(/<g class="h(\d+)">/g)].map(m => Number(m[1]))
  const sits = VISITORS.filter(v => v.action === 'bench').map(v => v.i)
  expect(order.slice(0, sits.length).sort()).toEqual([...sits].sort())
})

test('summer nights: fireflies over the hedge and the beds, out at night and not in the rain', async ($, on) => {
  // 10 p.m. in summer (hour 18 of the season) and in spring; a summer shower (hour 34.5)
  const [spring, summer, shower] = await scenesAt($, on, [inSeason(0, 18), inSeason(1, 18), inSeason(1, 34.5)])
  expect(summer).toContain('<g class="ffy dn"><g class="ffr"><use href="#ffl"')
  // one firefly drawn once, used at each of 16 places, at one of four paces
  expect(summer).toContain('<g id="fg"><rect x="-1" y="-1" width="3" height="3" fill="#c8f050" opacity=".3"/>')
  expect(summer).toMatch(/<g id="ffl">(<use class="ff fp[0-3]" href="#fg" x="\d+" y="\d+"\/>){16}<\/g>/)
  expect(summer).toMatch(/\.fp0\{animation-duration:[\d.]+s,[\d.]+s;--d:-[\d.]+s\}/)
  // on the day's clock: none by day, they come out from half past seven, gone by two
  // (out from after sunset into the small hours: summer's late sunset moves them later)
  expect(summer).toMatch(/@keyframes ffy\{0%\{opacity:1\}[\d.]+%\{opacity:\.6\}[\d.]+%\{opacity:0\}8[2-5][\d.]*%\{opacity:0\}(?:8[7-9]|9\d)[\d.]*%\{opacity:1\}100%\{opacity:1\}\}/)
  // blinking and drifting on the wall clock, so a redraw carries them on
  expect(summer).toMatch(/,\.ff,\.fp0,\.fp1,\.fp2,\.fp3\{animation-delay:calc\(var\(--d,0s\) - var\(--t,0s\)\)\}/)
  expect(startsAt(summer, 'ffr')).toBe('1')
  for (const other of [spring]) {
    expect(other).not.toContain('class="ffy')
    expect(other).not.toContain('<g id="ffl">')
  }
  expect(weatherAt(inSeason(1, 34.5) / 1000)).toBe('rain')
  expect(startsAt(shower, 'ffr')).toBe('0')
})

test('a blizzard: thick slanting snow and a white haze', async ($, on) => {
  // well into it, past its build-up
  const [from] = SPELLS.winter.find(s => s[2] === 'blizzard')!
  const source = await sceneAt($, on, inSeason(3, from + 0.3))
  expect(source).toContain('<g class="bzw">')
  expect(startsAt(source, 'bzw')).toBe('1')
  expect(source).toContain('@keyframes bza{to{transform:translate(-60px,44px)}}')
  // (nobody is out at a stop in it: the cast's plan keeps every visit dry, blizzards and all)
})

test('a blizzard builds up and dies down: the snow thickens before it and eases off after', async ($, on) => {
  const [from, to] = SPELLS.winter.find(s => s[2] === 'blizzard')!
  // 20 s before it: its slanting snow 40 s on the way (of 50 to its height), the heavier snow
  // 100 s (of 150), the sky a little darker
  const [before, after, later] = await scenesAt($, on, [inSeason(3, from - 1 / 3), inSeason(3, to + 1), inSeason(3, to + 2.5)])
  expect(weatherAt(inSeason(3, from - 1 / 3) / 1000)).toBe('snow')
  expect(startsAt(before, 'bzw')).toBe('.4')
  expect(startsAt(before, 'hvy')).toBe('.67')
  expect(startsAt(before, 'rcl')).toBe('.39')
  // and it eases off the same way: a minute after, its own snow gone, the heavier still falling
  expect(startsAt(after, 'bzw')).toBe('0')
  expect(startsAt(after, 'hvy')).toBe('.4')
  expect(after).toContain('<g class="sfc">')
  // past that, its art no longer drawn
  expect(later).not.toContain('<g class="hvy">')
})

test('/running-cat season and weather force a demo, this session only', async ($, on) => {
  mock.clock(on, { now: inSeason(1, 20) })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const said = await $.command.run({ command: 'running-cat', args: 'season winter' })
  expect(said.text).toContain('Park: winter (demo), day 1 of 4')
  expect((await band($, false)).source).toContain('[stroke="#ff9cc8"]{stroke:none}')
  await $.command.run({ command: 'running-cat', args: 'weather blizzard' })
  const storm = (await band($, false)).source ?? ''
  expect(startsAt(storm, 'bzw')).toBe('1')
  // a blizzard in a forced weather is still a blizzard: nobody sits out in it
  for (const { i } of VISITORS) for (const c of [1, 2]) expect([i, c, planned(storm, `h${i}u${c}`, 0)]).toEqual([i, c, 0])
  const back = await $.command.run({ command: 'running-cat', args: 'season auto' })
  expect(back.text).toContain('Park: summer, day 1 of 4; weather blizzard (demo)')
  await $.command.run({ command: 'running-cat', args: 'weather auto' })
  expect((await band($, false)).source).toContain('[stroke="#ff9cc8"]{stroke:#44a058}')
  expect((await $.command.run({ command: 'running-cat', args: 'season june' })).text).toContain('Usage:')
  // a new session goes back to the park's own season
  await $.command.run({ command: 'running-cat', args: 'season autumn' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await band($, false)).source).toContain('[stroke="#ff9cc8"]{stroke:#44a058}')
})

test('in the rain walkers carry umbrellas, the dog walker stays home, and the benches empty', async ($, on) => {
  const source = await sceneAt($, on, IN_RAIN)
  // out at all hours with an umbrella: wet on this lap, dry frames off
  expect(source).toMatch(/@keyframes ww1\{0%\{opacity:1\}/)
  expect(source).toMatch(/@keyframes wd1\{0%\{opacity:0\}/)
  // would be out now, but stays home in the rain
  expect(source).toMatch(/@keyframes wn4\{0%\{opacity:0\}/)
  // nobody sits out on the wet benches, reads, takes photos or buys a drink: only the toilet is dry
  for (const { i, action } of VISITORS) {
    if (action === 'toilet') continue
    for (const c of [1, 2]) expect([i, c, planned(source, `h${i}u${c}`, 0)]).toEqual([i, c, 0])
  }
})

test('every scene through two days of weather stays under the SVG size limit', async ($, on) => {
  const clock = mock.clock(on, { now: AT_2AM })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  let largest = 0
  for (let step = 0; step < 48; step++) {
    for (const isWorking of [false, true]) {
      largest = Math.max(largest, ((await band($, isWorking)).source ?? '').length)
    }
    await clock.advance(60_000)
  }
  expect(largest).toBeLessThan(131_072)
})

test('every season and every weather stays under the SVG size limit', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: inSeason(0, 0) })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let largest = 0
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    await $.command.run({ command: 'running-cat', args: `season ${season}` })
    for (const weather of ['clear', 'rain', 'snow', 'blizzard', 'auto']) {
      await $.command.run({ command: 'running-cat', args: `weather ${weather}` })
      for (let step = 0; step < 6; step++) {
        for (const isWorking of [false, true]) largest = Math.max(largest, ((await band($, isWorking)).source ?? '').length)
        await clock.advance(97 * 60_000)
      }
    }
  }
  expect(largest).toBeLessThan(131_072)
})

test('everyone is drawn from shared parts, each person in their own colours', async ($, on) => {
  const source = await sceneAt($, on, AT_NOON)
  // the parts: templates whose colours are variables, set per person
  expect(source).toContain('.cJ{stroke:var(--J)}')
  expect(source).toContain('.ca2{stroke:var(--a2,var(--j2))}')
  expect(source).toMatch(/<g id="[a-zA-Z]"><path class="c\w+" d="M/)
  // a person's own colour is always a stroke: a block of it filled would have no colour at all
  expect(source).toContain('style="fill:#')
  expect(source).not.toContain('fill:@')
  expect(source).toMatch(/<g class="w w0"><g class="wn0" transform="translate\(0,21\)"><g style="--B:#[0-9a-f]{6};/)
  // the drink buyer faces the machine, presses a button, then turns round and drinks
  expect(source).toMatch(/<g class="kb0">(?:<use href="#\w+"\/>){3}<\/g><g class="kb1">/)
  expect(source).toMatch(/\.v\d+ \.kf1\{animation:kf1\d+ /)
})

test('walkers turn round wholly off screen, even the dog walker', async ($, on) => {
  const source = await sceneAt($, on, AT_NOON)
  expect(source).toContain('@keyframes wr{0%{translate:-28px}100%{translate:964px}}')
})

test('caught out by a shower with no umbrella, walkers run for it off the scene, then are gone', async ($, on) => {
  // 14:40, twenty seconds before spring's 15:00 drizzle: walker 1 (out all hours) set off dry
  const source = await sceneAt($, on, inSeason(0, 11) - 20_000)
  // they run (a shift on their inner group, at a running pace, from the shower till the lap is
  // over) and bob each step while they run, leftwards as they walk
  const run = source.match(/\.wn1\{animation:(?:wn1 var\(--P\),)?rl 1000s linear 20s (0?\.\d+)/)
  expect(run).not.toBeNull()
  expect(Number(run?.[1])).toBeGreaterThan(0)
  expect(source).toContain('@keyframes rl{to{translate:-60000px}}')
  expect(source).toMatch(/\.w1\{animation:wl [\d.]+s linear -[\d.]+s infinite,bob \.2s step-end \d+ 20s/)
  expect(source).toContain('@keyframes bob{0%{translate:0 -1px}50%{translate:0 0}}')
  // and once off the scene they are gone, till the lap is over
  const seen = source.match(/@keyframes wn1\{(.*?)\}\}/)?.[1] ?? ''
  expect(seen).toMatch(/^0%\{opacity:1\}[\d.]+%\{opacity:0\}/)
})
