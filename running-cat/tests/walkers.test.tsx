import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { DAY, VISITORS, WALKERS } from '../hooks/park'
import { SEASON, SEASON_START, YEAR } from '../hooks/season'

const BAND = {
  plugin: 'running-cat',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

type Drawn = { props?: { source?: string } } | undefined

async function source($: Parameters<TestBody>[0]): Promise<string> {
  const ui = await $.ui.mount(BAND)
  const svg = (await ui.find({ type: 'Svg' })) as Drawn
  await ui.unmount()
  return svg?.props?.source ?? ''
}

const HORIZON = 2 * DAY
const EVERY = 30_000

// Moves the clock on `ms`, from `at` ms after the session started, with a look at the band at each
// of the cat's half-minute checks on the way (a long run's breather starts at one, and the band is
// redrawn then: a drawing from before it cannot know the park will stop) and at the end. `look`
// is handed how long the clock moved since the last look.
async function onBy(clock: { advance: (ms: number) => Promise<void> }, at: number, ms: number, look: (step: number) => Promise<void>): Promise<number> {
  let t = at
  const end = at + ms
  while (t < end) {
    const next = Math.min(end, (Math.floor(t / EVERY) + 1) * EVERY)
    await clock.advance(next - t)
    await look(next - t)
    t = next
  }
  return end
}

// Whether a walker's layer (wn: out, ww: umbrella, wd: no umbrella) shows `ms` into a drawing.
function shows(svg: string, cls: string, ms: number): boolean {
  const frames = svg.match(new RegExp(`@keyframes ${cls}\\{(.*?)\\}\\}`))?.[1]
  // with no plan of its own a layer keeps its own look: out and dry frames show, an umbrella not
  if (!frames) return !cls.startsWith('ww')
  const at = (ms / 1000 / HORIZON) * 100
  let on = true
  // (the match took the last mark's closing brace with the keyframes' own)
  for (const [, p, o] of `${frames}}`.matchAll(/([\d.]+)%\{opacity:(\d)\}/g)) if (Number(p) <= at + 1e-9) on = o === '1'
  return on
}

// Who stands on a stage's copy `ms` into a drawing: its --w (0 for nobody), held at the last mark.
function who(svg: string, name: string, ms: number): string {
  const frames = svg.match(new RegExp(`@keyframes ${name}\\{(.*?)\\}\\}`))?.[1]
  if (!frames) return '0'
  let w = '0'
  for (const [, p, v] of `${frames}}`.matchAll(/([\d.]+)%\{--w:(\d+)\}/g)) if (Number(p) <= (ms / 1000 / 360) * 100 + 1e-9) w = v!
  return w
}

// Whether who stands on a stage's copy differs between a drawing `age` ms on and the next at its
// start, give or take the 36 ms a keyframe's two decimals of 360 s can be off by.
const moved = (before: string, after: string, name: string, age: number): boolean =>
  [age - 40, age, age + 40].every(ms => who(before, name, ms) !== who(after, name, 0))

// Where a walker stands on the scene `ms` into a drawing (art px), from its walk animation. A
// drawing that holds the park a while (a breather, a stumble) has two walks: on their own till the
// path moves (listed last, so it wins till then), then carried by it.
function where(svg: string, i: number, ms: number): number | null {
  const walks = svg.match(new RegExp(`\.w${i}\{animation:([^}]*)\}`))?.[1]
  if (!walks) return null
  const all = [...walks.matchAll(/(w[rl]) ([\d.]+)s linear (-?[\d.]+)s/g)]
  if (!all.length) return null
  const go = Number(svg.match(/hold ([\d.]+)s\}/)?.[1] ?? 0)
  const s = ms / 1000
  const m = all.length > 1 && s < go ? all[1]! : all[0]!
  const dur = Number(m[2])
  const f = ((((s - Number(m[3])) % dur) + dur) % dur) / dur
  return m[1] === 'wr' ? -28 + 992 * f : 964 - 992 * f
}

for (const hour of [9.37, 14.71, 17.13]) {
  test(`nobody pops in or out, walking or at a stop, at a redraw while the cat runs (${hour}h)`, { timeoutMs: 60_000 }, async ($, on) => {
    const clock = mock.clock(on, { now: (2880 * 500 + hour * 60) * 1000 })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await clock.advance(10_000)

    let before = await source($)
    // how long the drawing up has played: a band in view keeps it a while, so a tick may hand it back
    let age = 0
    let redraws = 0
    const pops: string[] = []
    let at = 10_000
    for (let n = 0; n < 40; n++) at = await onBy(clock, at, EVERY + 7_000, async step => {
      age += step
      const after = await source($)
      if (after === before) return
      redraws++
      for (const { i } of WALKERS) {
        const x = where(after, i, 0)
        if (x === null || x < -10 || x > 960) continue
        for (const cls of [`wn${i}`, `ww${i}`, `wd${i}`]) {
          if (shows(before, cls, age) !== shows(after, cls, 0)) pops.push(`${cls} at x${Math.round(x)} after ${n + 1} redraws`)
        }
      }
      for (const { i } of VISITORS) {
        for (let c = 0; c < 6; c++) {
          if (moved(before, after, `h${i}u${c}`, age)) pops.push(`stage ${i} copy ${c}: ${who(before, `h${i}u${c}`, age)} -> ${who(after, `h${i}u${c}`, 0)} after ${n + 1} redraws`)
        }
      }
      before = after
      age = 0
    })
    expect(pops).toEqual([])
    expect(redraws).toBeGreaterThan(1)
  })
}

// Summer's shower at hour 13 into the season, and one at 86: redrawn every 3 s from 40 s before
// it, the cat idle. A redraw on the very second a walker starts a lap must see them on that lap,
// not the one before: the one before began in the rain (out with an umbrella, or kept home), and
// the next redraw had them pop in mid-scene or change their look (v0.40.0 and before).
for (const hours of [13, 86]) {
  test(`a redraw just as a walker starts a lap sees the lap they are on (summer, ${hours}h)`, async ($, on) => {
    const spring = Math.floor((1440 * 1000) / YEAR) * YEAR + SEASON_START
    const clock = mock.clock(on, { now: (spring + SEASON + hours * 60 - 40) * 1000 })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const idle = async (): Promise<string> => {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: false } })
      const svg = (await ui.find({ type: 'Svg' })) as Drawn
      await ui.unmount()
      return svg?.props?.source ?? ''
    }
    let before = await idle()
    const pops: string[] = []
    for (let n = 1; n <= 50; n++) {
      await clock.advance(3_000)
      const after = await idle()
      for (const { i } of WALKERS) {
        const x = where(after, i, 0)
        if (x === null || x < -10 || x > 960) continue
        for (const cls of [`wn${i}`, `ww${i}`, `wd${i}`]) {
          if (shows(before, cls, 3_000) !== shows(after, cls, 0)) pops.push(`${cls} at x${Math.round(x)}, ${3 * n - 40} s from the shower`)
        }
      }
      before = after
    }
    expect(pops).toEqual([])
  })
}

test("the park's little loops carry on across a redraw, on the wall clock", async ($, on) => {
  const clock = mock.clock(on, { now: (2880 * 500 + 21.3 * 60) * 1000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const t = (svg: string): number => Number(svg.match(/svg\{--t:([\d.]+)s\}/)?.[1])

  const first = await source($)
  await clock.advance(7_300)
  const second = await source($)
  // the clock they share moves on by just the time between the drawings
  expect((t(second) - t(first)).toFixed(1)).toBe('7.3')
  // every loop counts from it, each with its own offset
  expect(first).toContain('.tw0,.tw1,.tw2,.beacon,.win,.neon2,.lampglow,.lamp,')
  expect(first).toContain('{animation-delay:calc(var(--d,0s) - var(--t,0s))}')
  expect(first).not.toMatch(/animation-delay:-[\d.]+s"/)
})

test('the walk before a run sets the park off itself: a late redraw finds everyone as drawn', async ($, on) => {
  const clock = mock.clock(on, { now: (2880 * 500 + 16.9 * 60) * 1000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1_000)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  const walking = await source($)
  // no redraw for 40 s after the walk: the walk's drawing has gone on by itself all that while
  await clock.advance(40_000)
  const running = await source($)
  const off: string[] = []
  for (const { i } of WALKERS) {
    for (const cls of [`wn${i}`, `ww${i}`, `wd${i}`]) if (shows(walking, cls, 40_000) !== shows(running, cls, 0)) off.push(cls)
  }
  for (const { i } of VISITORS) {
    for (let c = 0; c < 6; c++) if (who(walking, `h${i}u${c}`, 40_000) !== who(running, `h${i}u${c}`, 0)) off.push(`h${i}u${c}`)
  }
  expect(off).toEqual([])
})

test('a redraw at a fresh tick shows the park as it is now, not as it was drawn before', async ($, on) => {
  const clock = mock.clock(on, { now: (2880 * 500 + 12.2 * 60) * 1000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(EVERY)
  // the park's own clock (--t, the wall clock it counts from) moves on with each redraw: the app
  // plays a drawing from its start each time it puts it up, so an old one would set it back
  const t = (svg: string): number => Number(svg.match(/svg\{--t:([\d.]+)s\}/)?.[1])
  let last = t(await source($))
  for (let n = 0; n < 6; n++) {
    await clock.advance(EVERY)
    const now = t(await source($))
    expect((now - last).toFixed(1)).toBe((EVERY / 1000).toFixed(1))
    last = now
  }
})

test('a change of pace moves nobody: each walker, and who stands where, goes on from where they were', async ($, on) => {
  const clock = mock.clock(on, { now: (2880 * 500 + 10.4 * 60) * 1000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(5_000)
  let row = 0
  const use = async (name: string): Promise<void> => {
    row += 1
    await $.session.append({
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: `toolu_p${row}`, name, input: {} }] },
      door: 'response',
      origin: { kind: 'model', model: 'claude-opus-5-5' },
      uuid: `pace-${row}`,
    })
  }
  let before = await source($)
  let age = 0
  const off: string[] = []
  const look = async (n: number): Promise<void> => {
    const after = await source($)
    for (const { i } of WALKERS) {
      const was = where(before, i, age)
      const is = where(after, i, 0)
      if (was !== null && is !== null && Math.abs(was - is) > 1 && Math.abs(was - is) < 990) off.push(`w${i} ${was.toFixed(1)} -> ${is.toFixed(1)} at ${n}`)
      for (const cls of [`wn${i}`, `ww${i}`, `wd${i}`]) if (is !== null && is > -10 && is < 960 && shows(before, cls, age) !== shows(after, cls, 0)) off.push(`${cls} at ${n}`)
    }
    for (const { i } of VISITORS) {
      for (let c = 0; c < 6; c++) if (moved(before, after, `h${i}u${c}`, age)) off.push(`h${i}u${c} at ${n}`)
    }
    before = after
    age = 0
  }
  let at = 5_000
  // brisk, steady, easy, brisk, ...: a burst of edits, then quiet, then reading
  for (let n = 0; n < 12; n++) {
    // (each pace held 15 s at least; eased back to steady 30 s after the burst: the band is redrawn then)
    const wait = n % 3 === 1 ? 30_001 - 15_001 : 15_001
    // (a look at each half-minute check on the way, and a last one after the tools)
    at = await onBy(clock, at, wait - 1, async step => {
      age += step
      await look(n)
    })
    await clock.advance(1)
    age += 1
    at += 1
    if (n % 3 === 0) for (const tool of ['Edit', 'Bash', 'Write', 'Edit']) await use(tool)
    if (n % 3 === 2) for (const tool of ['Read', 'Grep']) await use(tool)
    await look(n)
  }
  expect(off).toEqual([])
})
