import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { CAT_FRAMES, CAT_H } from './cat-frames'
import { CAT_X, CAT_Y, DAY, HORIZON, LAYERS, PARK_BACK, PARK_DEFS, PARK_FRONT, PARK_H, PARK_MID, PARK_STYLE, PARK_TOP, PARK_W, PARK_AUTUMN_DEFS, PARK_AUTUMN_STYLE, PARK_SUMMER_DEFS, PARK_SUMMER_STYLE, PARK_WINTER_DEFS, PARK_WINTER_PAINT, PARK_WINTER_STYLE, TRAIN_PERIOD, VISIT_COPIES, VISITORS, WALK_LOOP, WALK_PAD, WALKERS } from './park'
import { makePark, visitOffset } from './cast'
import type { Park } from './cast'
import { SEASONS, WEATHERS, isWet, seasonAt, seasonEnd, seasonHour, snowDepth, solarHour, sunHours, weatherAt, weatherChanges } from './season'
import type { Season, Sky, Weather } from './season'

// Each art pixel is drawn this many CSS pixels tall.
const SCALE = 2
// How long the cat stands after the last task before it settles down for a nap.
const REST_AFTER_MS = 20_000
// The row under the cat's feet, and its left edge, in the park.
const CAT_FEET = CAT_Y + 14
const CAT_LEFT = CAT_X + 8

// ---------- colours by name ----------

// Every colour drawn more than once gets a short class, the same in every scene: `class="z3"` in
// place of `stroke="#222034"` on each run, to keep the band under the Svg size limit.
const PAINT = /<path (stroke="|style="fill:)(#[0-9a-f]{6})"/g
const PAINT_CLASS = (() => {
  const counts = new Map<string, number>()
  const art = [PARK_DEFS, PARK_BACK, PARK_MID, PARK_FRONT, ...Object.values(CAT_FRAMES).flat()].join('')
  for (const [, kind, colour] of art.matchAll(PAINT)) {
    const key = kind + colour
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const names = new Map<string, string>()
  for (const [key] of [...counts].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1])) {
    names.set(key, `z${names.size.toString(36)}`)
  }
  return names
})()
const PAINT_CSS = [...PAINT_CLASS]
  .map(([key, name]) => `.${name}{${key.startsWith('stroke') ? 'stroke' : 'fill'}:${key.slice(key.indexOf('#'))}}`)
  .join('')

// Art markup with its colours by class where they have one.
const classedCache = new Map<string, string>()
export function classed(markup: string): string {
  const known = classedCache.get(markup)
  if (known !== undefined) return known
  const out = markup.replace(PAINT, (whole, kind: string, colour: string) => {
    const name = PAINT_CLASS.get(kind + colour)
    return name === undefined ? whole : `<path class="${name}"`
  })
  if (markup.length < 4000) classedCache.set(markup, out)
  return out
}
const ART_DEFS = classed(PARK_DEFS)

// Where the <g> opening at `at` closes: the index just past its </g>.
function closeOf(markup: string, at: number): number {
  let depth = 0
  let i = at
  for (;;) {
    const open = markup.indexOf('<g', i)
    const shut = markup.indexOf('</g>', i)
    if (shut < 0) return markup.length
    if (open >= 0 && open < shut && (markup[open + 2] === ' ' || markup[open + 2] === '>')) {
      depth++
      i = open + 2
    } else if (open >= 0 && open < shut) {
      i = open + 2
    } else {
      depth--
      i = shut + 4
      if (depth === 0) return i
    }
  }
}

// The visitors' markup (#vis), stage by stage. Each stage holds everyone who may use it, shown
// by its --w; a drawing carries only those its plan shows, since every one drawn is built four
// times over (once a copy of the park's tile) and all of them at once took the app a fifth of a
// second to put up, the park frozen meanwhile.
const VIS_OPEN = '<g id="vis">'
const VIS_AT = ART_DEFS.indexOf(VIS_OPEN)
const VIS_END = closeOf(ART_DEFS, VIS_AT)
const DEFS_BEFORE = ART_DEFS.slice(0, VIS_AT)
const DEFS_AFTER = ART_DEFS.slice(VIS_END)
const VIS_PARTS: { stage: number | null; markup: string }[] = (() => {
  const inner = ART_DEFS.slice(VIS_AT + VIS_OPEN.length, VIS_END - 4)
  const parts: { stage: number | null; markup: string }[] = []
  let i = 0
  while (i < inner.length) {
    const stage = /^<g class="h(\d+)">/.exec(inner.slice(i))
    if (stage === null) {
      const next = inner.indexOf('<g class="h', i)
      const end = next < 0 ? inner.length : next
      parts.push({ stage: null, markup: inner.slice(i, end) })
      i = end
    } else {
      const end = closeOf(inner, i)
      parts.push({ stage: Number(stage[1]), markup: inner.slice(i, end) })
      i = end
    }
  }
  return parts
})()

// A stage's markup with only the people numbered in `keep` (its variants): their walk and stop.
function onlyVariants(markup: string, keep: ReadonlySet<number>): string {
  const walks = markup.replace(/<use class="k(\d+)" href="#wk\d+"\/>/g, (whole, n: string) => (keep.has(Number(n)) ? whole : ''))
  let out = ''
  let i = 0
  for (const m of walks.matchAll(/<g class="k(\d+) pp\d+">/g)) {
    if (m.index < i || keep.has(Number(m[1]))) continue
    out += walks.slice(i, m.index)
    i = closeOf(walks, m.index)
  }
  return out + walks.slice(i)
}

// The art's defs with the visitors cut to those who show: stage i to the variants in shown[i].
function defsFor(shown: ReadonlyMap<number, ReadonlySet<number>>): string {
  const vis = VIS_PARTS.map(({ stage, markup }) => {
    if (stage === null) return markup
    const keep = shown.get(stage)
    return keep === undefined || keep.size === 0 ? '' : onlyVariants(markup, keep)
  }).join('')
  return `${DEFS_BEFORE}${VIS_OPEN}${vis}</g>${DEFS_AFTER}`
}
const ART_BACK = classed(PARK_BACK)
const ART_MID = classed(PARK_MID)
const ART_FRONT = classed(PARK_FRONT)

const isResting = atom({ plugin: 'running-cat', key: 'isResting' } as const, false)
// When the cat began settling down (look around, sit, lie down, sleep).
const restSince = atom({ plugin: 'running-cat', key: 'restSince' } as const, 0)
// When a task set the cat going (getting up from its nap, or a few steps' walk first), or null
// once the task is over; and whether it was napping then.
const wokeAt = atom({ plugin: 'running-cat', key: 'wokeAt' } as const, null)
const wasNapping = atom({ plugin: 'running-cat', key: 'wasNapping' } as const, false)
// The time the cat has run in all, so the park stops where the run left it and starts from there.
const runMs = atom({ plugin: 'running-cat', key: 'runMs' } as const, 0)
// When the current run began, or null while the cat is still. A cat getting up starts later.
const runStartedAt = atom({ plugin: 'running-cat', key: 'runStartedAt' } as const, null)
// When a task done before the cat had run a while ends its run (it runs on till then), or null.
const finishAt = atom({ plugin: 'running-cat', key: 'finishAt' } as const, null)
// A cat set going runs at least this long before it brakes: braking and jumping for joy out of a
// few steps' walk looks odd.
const MIN_RUN_MS = 2_000
// Bumped when a cat set going has got up or walked off, so the band redraws with the park moving.
const wakeDone = atom({ plugin: 'running-cat', key: 'wakeDone' } as const, 0)
// When the cat last came to a stand (a task done, or the session started), and how it got there.
const idleSince = atom({ plugin: 'running-cat', key: 'idleSince' } as const, 0)
const idleIntro = atom({ plugin: 'running-cat', key: 'idleIntro' } as const, 'still')
// Bumped when the cat moves on to the second part of standing about, to redraw the band.
const idleTick = atom({ plugin: 'running-cat', key: 'idleTick' } as const, 0)
// Bumped every FRESH_MS, so the band is always due a redraw. A session out of sight draws nothing,
// and the app shows its band again as it was last drawn, the park's clock stuck at that moment
// (night gone to noon after ten minutes away) until something redraws it. Bumped while out of
// sight, the band is redrawn as soon as it is seen again. It also gives a band left alone a fresh
// plan: the people's plans repeat every HORIZON, but a run for it in a shower is a one-off.
const freshTick = atom({ plugin: 'running-cat', key: 'freshTick' } as const, 0)
const FRESH_MS = 30_000
// What `/running-cat season` and `/running-cat weather` force for a demo, this session only.
const demoSeason = atom({ plugin: 'running-cat', key: 'demoSeason' } as const, null)
const demoWeather = atom({ plugin: 'running-cat', key: 'demoWeather' } as const, null)

// ---------- the cat's moves ----------

// A stretch of frames: played `times` times in order, or, last in a move, looped for good.
type Step = { frames: readonly string[]; ms: number; times?: number }

const RUN: readonly Step[] = [{ frames: CAT_FRAMES.run, ms: 100 }]

type Intro = 'still' | 'stop' | 'cheer'
// How the cat comes to a stand: as it was; braking out of a run and flashing red, hurt, when the
// task was stopped; or braking and jumping for joy when it came to an answer. (No walk before the
// brake: the jump and the standing about after it already fill the picture to its size limit.)
const INTRO: Record<Intro, readonly Step[]> = {
  still: [],
  stop: [
    { frames: CAT_FRAMES.stop, ms: 110, times: 1 },
    { frames: CAT_FRAMES.hurt, ms: 120, times: 3 },
  ],
  cheer: [
    { frames: CAT_FRAMES.stop, ms: 110, times: 1 },
    { frames: CAT_FRAMES.jump, ms: 110, times: 1 },
  ],
}
// Standing about comes in two parts, drawn one at a time to keep the picture small. The first:
// breathing, then a sit with the tail going, then up again.
const IDLE_SIT: readonly Step[] = [
  { frames: CAT_FRAMES.idle, ms: 120, times: 3 },
  { frames: CAT_FRAMES.idle2, ms: 120, times: 2 },
  { frames: CAT_FRAMES.sitDown, ms: 160, times: 1 },
  { frames: CAT_FRAMES.sit1, ms: 140, times: 2 },
  { frames: CAT_FRAMES.sit2, ms: 140, times: 2 },
  { frames: CAT_FRAMES.sitUp, ms: 150, times: 1 },
  { frames: CAT_FRAMES.idle, ms: 120 },
]
// The second: up on its hind legs for a scratch, then breathing until nap time.
const IDLE_SCRATCH: readonly Step[] = [
  { frames: CAT_FRAMES.idle, ms: 120, times: 1 },
  { frames: CAT_FRAMES.rise, ms: 110, times: 1 },
  { frames: CAT_FRAMES.scratch, ms: 100, times: 2 },
  { frames: CAT_FRAMES.lower, ms: 110, times: 1 },
  { frames: CAT_FRAMES.idle, ms: 120 },
]
// Looks right and left, sits, lies down with its head up a moment, sleeps, then sleeps deeply.
const SETTLE: readonly Step[] = [
  { frames: CAT_FRAMES.idle.slice(0, 4), ms: 120, times: 1 },
  { frames: CAT_FRAMES.look, ms: 140, times: 1 },
  { frames: CAT_FRAMES.lookLeft, ms: 140, times: 1 },
  { frames: CAT_FRAMES.sitDown, ms: 160, times: 1 },
  { frames: CAT_FRAMES.sitDown.slice(3), ms: 700, times: 1 },
  { frames: CAT_FRAMES.lieHead, ms: 180, times: 3 },
  { frames: CAT_FRAMES.sleep, ms: 180, times: 40 },
  { frames: CAT_FRAMES.dream, ms: 200 },
]
// Lifts its head first, looks about, gets up, has a long stretch, walks off, then runs.
const WAKE: readonly Step[] = [
  { frames: CAT_FRAMES.lieHead, ms: 170, times: 3 },
  { frames: CAT_FRAMES.sitUp, ms: 150, times: 1 },
  { frames: CAT_FRAMES.bowDown, ms: 160, times: 1 },
  { frames: CAT_FRAMES.bowUp, ms: 150, times: 1 },
  { frames: CAT_FRAMES.walk, ms: 100, times: 1 },
  { frames: CAT_FRAMES.run, ms: 100 },
]
// An awake cat walks a few steps, then runs.
const START: readonly Step[] = [
  { frames: CAT_FRAMES.walk, ms: 100, times: 1 },
  { frames: CAT_FRAMES.run, ms: 100 },
]

// How long the steps before a move's loop take.
const leadMs = (move: readonly Step[]): number =>
  move.slice(0, -1).reduce((ms, step) => ms + step.frames.length * step.ms * (step.times ?? 1), 0)
// How long getting up, or walking off, takes before the run, when the park starts to move.
const WAKE_MS = leadMs(WAKE)
const START_MS = leadMs(START)
// The first part of standing about, after the given way of coming to a stand.
const standFirst = (intro: Intro): readonly Step[] => [...INTRO[intro], ...IDLE_SIT]

// The part of standing about due `elapsedMs` after the cat came to a stand, and how far into it.
function standMove(intro: Intro, elapsedMs: number): { move: readonly Step[]; at: number } {
  const first = standFirst(intro)
  const firstMs = leadMs(first)

  return elapsedMs < firstMs ? { move: first, at: elapsedMs } : { move: IDLE_SCRATCH, at: elapsedMs - firstMs }
}

const ON = '@keyframes on{0%,100%{opacity:1}}'
const loopKeyframes = (n: number): string => `@keyframes fr${n}{0%{opacity:1}${(100 / n).toFixed(3)}%{opacity:0}100%{opacity:0}}`

// The cat at `elapsedMs` into `move`: each frame shown in its own windows of time, so a band
// redrawn halfway carries on where it was. Returns the markup and the keyframes it needs.
function catMove(move: readonly Step[], elapsedMs: number): { svg: string; css: string } {
  // A CSS time, `ms` into the move as seen from `elapsedMs` (negative once it has begun).
  const seconds = (ms: number): string => `${((ms - elapsedMs) / 1000).toFixed(3)}s`
  const loops = new Set<number>()
  // Each distinct frame is drawn once, shown in every window it has across the move.
  const shown = new Map<string, { frame: string; windows: string[]; still: boolean; hasLoop: boolean }>()
  let at = 0

  move.forEach((step, k) => {
    const isLoop = k === move.length - 1 && step.times === undefined
    const repeats = isLoop || (step.times ?? 1) > 1
    const inStep = new Set<string>()
    step.frames.forEach((frame, i) => {
      let animation: string

      if (isLoop) {
        const n = step.frames.length
        loops.add(n)
        animation = `fr${n} ${((n * step.ms) / 1000).toFixed(3)}s steps(1,end) infinite ${seconds(at + i * step.ms)}`
      } else {
        const n = step.frames.length
        const times = step.times ?? 1
        const first = at + i * step.ms
        // A frame whose last window is already over never shows again: leave it out.
        if (first + ((times - 1) * n + 1) * step.ms <= elapsedMs) {
          return
        }
        if (times > 1) {
          // Its turn in each round, `times` rounds: one repeating animation rather than a window
          // a round, so a long doze stays small.
          loops.add(n)
          animation = `fr${n} ${((n * step.ms) / 1000).toFixed(3)}s steps(1,end) ${times} ${seconds(first)}`
        } else {
          animation = `on ${(step.ms / 1000).toFixed(3)}s steps(1,end) ${seconds(first)}`   // once: the default
        }
      }
      // A frame that comes round twice in a repeating step (the loop, a doze) gets its own copy:
      // two repeating animations on one frame would fight, the later one hiding it through the
      // earlier one's turn, and the cat would blink out.
      const key = repeats && inStep.has(frame) ? `${frame}#${k}.${i}` : frame
      inStep.add(frame)
      const entry = shown.get(key) ?? { frame, windows: [], still: false, hasLoop: false }
      entry.windows.push(animation)
      entry.still ||= isLoop && i === 0
      entry.hasLoop ||= isLoop
      shown.set(key, entry)
    })
    at += step.frames.length * step.ms * (step.times ?? 1)
  })

  let svg = ''
  let rules = ''
  let index = 0
  for (const { frame, windows, still } of shown.values()) {
    // Each frame's timing lives in the style block: the desktop drops inline style attributes.
    svg += `<g class="c cf${index}${still ? ' c0' : ''}">${classed(frame)}</g>`
    rules += `.cf${index}{animation:${windows.join(',')}}`
    index++
  }

  return {
    svg: `<g transform="translate(${CAT_LEFT},${CAT_FEET - CAT_H})">${svg}</g>`,
    css: ON + rules + [...loops].map(loopKeyframes).join(''),
  }
}

const CAT_STYLE = '.c{opacity:0}@media (prefers-reduced-motion: reduce){.c{animation:none!important}.c0{opacity:1}}'

// ---------- the park ----------

// Where each layer stands after `ranMs` of running: moving on from there, or held there. The
// layers glide (no whole-pixel steps), in time with the walkers, so nobody judders against the path.
function layerStyle(ranMs: number, go: Go): string {
  const layers = LAYERS.map(({ cls, tile, speed }) => {
    const seconds = tile / speed
    const at = ((ranMs / 1000) * speed) % tile
    // Held on a half art pixel, a whole screen pixel, so a still park is sharp.
    const held = Math.round(at * 2) / 2

    // Still, on a whole art pixel: drawn sharp (no GLIDE), nothing in it falls between pixels.
    if (go === null) {
      return `.${cls}{transform:translateX(-${Math.round(at) % tile}px)}`
    }
    if (go > 0) {
      // Held till the cat sets off, then on from there: the drawing starts the park itself, so
      // it moves on time even if the next redraw is late. It moves off from where it truly
      // stands (not the held whole pixel), as the redraw after will have it.
      return (
        `.${cls}{--h:-${held}px;animation:${cls} ${seconds}s linear ${(go - at / speed).toFixed(3)}s infinite,hold ${go.toFixed(3)}s}` +
        `@keyframes ${cls}{0%{transform:translateX(0)}100%{transform:translateX(-${tile}px)}}`
      )
    }

    return (
      `.${cls}{animation:${cls} ${seconds}s linear infinite;animation-delay:-${(at / speed).toFixed(3)}s}` +
      `@keyframes ${cls}{0%{transform:translateX(0)}100%{transform:translateX(-${tile}px)}}`
    )
  }).join('')
  return layers + (go !== null && go > 0 ? '@keyframes hold{0%,to{transform:translateX(var(--h))}}' : '')
}

// When the path moves, in seconds from this redraw: null for not at all, 0 for already moving,
// more for a cat that sets off once it has stretched or walked off.
type Go = number | null

// The path the walkers loop over: from WALK_PAD px off the left edge to just off the right, so
// even the widest (the dog walker) turns round off screen.
const LOOP = WALK_LOOP
// How fast the path moves while the cat runs (the park layer's speed).
const PATH_SPEED = LAYERS.find(layer => layer.cls === 'lp')?.speed ?? 0

const wrap = (x: number, span: number): number => ((x % span) + span) % span

// Walkers walk on the path, so the path's scroll carries them: each one's place on screen is
// their own walk so far less how far the path has moved, and while the cat runs their speed on
// screen is their walking speed less the path's. A redraw starts each one from where they are.
// A walk across the scene at `speed` art px a second, at `at` (0..LOOP from x = -WALK_PAD) `from`
// seconds after this redraw: `wr` runs -WALK_PAD -> W+4, `wl` the other way.
function walkAnimation(at: number, speed: number, from = 0): { name: string; seconds: number; delay: number } {
  const seconds = LOOP / Math.abs(speed)
  const since = speed > 0 ? at / speed : (LOOP - at) / -speed
  return { name: speed > 0 ? 'wr' : 'wl', seconds, delay: since - from }
}

function walkerStyle(nowMs: number, ranMs: number, go: Go): string {
  return WALKERS.map(w => {
    const { i, dir, dur } = w
    const walk = LOOP / dur
    const t0 = nowMs / 1000
    const at = wrap(dir * walk * t0 - PATH_SPEED * (ranMs / 1000), LOOP)
    const speed = dir * walk - (go === 0 ? PATH_SPEED : 0)
    const { name, seconds, delay } = walkAnimation(at, speed)
    // to the thousandth of a second: the cyclist covers ~40 art px a second, so a hundredth off in
    // a lap's length drifts them half a pixel by the next redraw
    let walks = `${name} ${seconds.toFixed(3)}s linear -${delay.toFixed(3)}s infinite`
    if (go !== null && go > 0) {
      // on their walk till the path moves, then on it as it carries them: the second walk, from
      // where the first leaves them, takes over (the first is listed last, so it wins till then)
      const then = walkAnimation(wrap(dir * walk * (t0 + go) - PATH_SPEED * (ranMs / 1000), LOOP), dir * walk - PATH_SPEED, go)
      walks =
        `${then.name} ${then.seconds.toFixed(3)}s linear ${(-then.delay).toFixed(3)}s infinite,` +
        `${name} ${seconds.toFixed(3)}s linear -${delay.toFixed(3)}s ${((delay + go) / seconds).toFixed(4)}`
    }

    // running for it in a shower: a bob each step, for as long as the run lasts
    const bobs = walkerPlan(w, nowMs / 1000, ranMs / 1000, go)
      .dashes.filter(d => d.exit > nowMs / 1000)
      .map(d => `,bob ${BOB}s steps(1,end) ${Math.ceil((d.exit - d.r) / BOB)} ${(d.r - nowMs / 1000).toFixed(2)}s`)
      .join('')
    return `.w${i}{animation:${walks}${bobs}}`
  }).join('') + `@keyframes bob{0%{translate:0 -1px}50%{translate:0 0}}` + RUN_KEYFRAMES
}

// ---------- who is out: fewer people at night ----------

// The spans of the day someone is out, each (from, to) in hours; null for all day and night.
type Hours = readonly (readonly [number, number])[] | null

// The park's hour (0..24) at `t` seconds of wall clock.
const hourAt = (t: number): number => (wrap(t, DAY) / DAY) * 24

const isOut = (hours: Hours, t: number): boolean => {
  if (hours === null) return true
  const h = hourAt(t)
  return hours.some(([from, to]) => (from < to ? h >= from && h < to : h >= from || h < to))
}

// What a demo forces (a season, or a weather), set from the state before each drawing.
let sky: Sky = {}

// Whether it is wet at `t` seconds (rain, or a blizzard): the season's own spells of weather.
const isRaining = (t: number): boolean => isWet(weatherAt(t, sky))


// A visibility timeline over HORIZON seconds from `t0`, as keyframes that only mark changes:
// `cuts` are the times anything could change, `seen(t)` whether the person shows at t.
function timeline(name: string, t0: number, cuts: number[], seen: (t: number) => boolean): string | null {
  const ends = [...cuts.filter(t => t > t0 && t < t0 + HORIZON), t0 + HORIZON].sort((x, y) => x - y)
  let from = t0
  let last: boolean | null = null
  let frames = ''
  let changes = 0
  for (const end of ends) {
    const on = seen((from + end) / 2)
    if (on !== last) {
      frames += `${(((from - t0) / HORIZON) * 100).toFixed(3)}%{opacity:${on ? 1 : 0}}`
      changes += 1
      last = on
    }
    from = end
  }
  if (changes === 1 && last) return null // out the whole time: nothing to write
  // steps(1,end) holds the last mark to the end, and the plan repeats from its start
  return `@keyframes ${name}{${frames}}`
}

// Times from t0 to the horizon when `x(t)` (moving at `speed` per second) crosses a multiple of `span`.
function crossings(t0: number, x0: number, speed: number, span: number): number[] {
  if (speed === 0) return []
  const out: number[] = []
  let k = speed > 0 ? Math.floor(x0 / span) + 1 : Math.ceil(x0 / span) - 1
  for (;;) {
    const t = t0 + (k * span - x0) / speed
    if (t >= t0 + HORIZON) return out
    out.push(t)
    k += speed > 0 ? 1 : -1
  }
}

// How fast someone caught out in a shower runs for it (art px a second, on top of their walk),
// and how far back a redraw looks for a shower that began while they were still running or gone.
const RUN_SPEED = 60
const DASH_BACK = 300
// One step of running: a bob up and down.
const BOB = 0.2

// The times in [from, to) a shower (or a blizzard) starts.
function rainStarts(from: number, to: number): number[] {
  return weatherChanges(from, to, sky).filter(t => isRaining(t + 0.01) && !isRaining(t - 0.01))
}

type Dash = { r: number; exit: number; end: number; s: number }

const snap = (t: number): number => Math.round(t * 1000) / 1000

// When each walker set off on each lap, as the redraws saw it: walker -> lap -> time. A lap's
// set-off depends on how the path moved while they walked it, which a later redraw cannot work
// out from where the path is now; so each redraw writes down the laps it plans, and the next one
// keeps the time of the lap already under way. Cleared at session.start.
const setOffs = new Map<number, Map<number, number>>()
const forgetSetOffs = (): void => setOffs.clear()

// A walker's laps as this redraw sees them: where they are, when each lap set off, whether they
// are out on it, and when a shower catches them out with no umbrella. Then they run for it, on the
// way they were going, off the scene, and are gone till that lap is over.
function walkerPlan(w: (typeof WALKERS)[number], t0: number, ran0: number, go: Go) {
  const { dir, dur, hours, rain } = w
  const walk = LOOP / dur
  // the path sets off at `moves` (never, if still), and carries them from then
  const moves = go === null ? Infinity : t0 + go
  const x = (t: number): number => dir * walk * t - PATH_SPEED * (ran0 + Math.max(0, t - moves))
  const speedAt = (t: number): number => dir * walk - (t >= moves ? PATH_SPEED : 0)
  // the times from `from` on that they pass a lap's end, the path's speed changing on the way
  const lapEnds = (from: number): number[] =>
    from < moves && moves < from + HORIZON
      ? [...crossings(from, x(from), speedAt(from), LOOP).filter(c => c < moves),
         ...crossings(moves, x(moves), speedAt(moves), LOOP).filter(c => c < from + HORIZON)]
      : crossings(from, x(from), speedAt(from), LOOP)
  // (to the millisecond: worked out from where they are, or from when they cross, a lap that sets
  // off just as a shower starts must come out the same, in the rain or not, every redraw)
  const lapStart = (lap: number): number =>
    snap(dir > 0 ? (lap * LOOP + PATH_SPEED * ran0) / walk : -((lap + 1) * LOOP + PATH_SPEED * ran0) / walk)
  // A lap that begins after this redraw sets off when they come onto the path as it moves now;
  // the lap they are on keeps the time it had, so a redraw changes nothing in view.
  const laps = lapEnds(t0).map(snap)
  // the lap they are on now: the time an earlier redraw had for it, if it had begun by now
  const seen = setOffs.get(w.i) ?? new Map<number, number>()
  setOffs.set(w.i, seen)
  // (a hair on: on the very moment they start a lap they are on it, whichever way they go; at x(t0)
  // itself a walker going left, just at a lap's end, counted as still on the lap before)
  const lap0 = Math.floor(x(t0 + 0.01) / LOOP)
  const kept = seen.get(lap0)
  const start0 = kept !== undefined && kept <= t0 ? kept : lapStart(lap0)
  // write down the plan: this lap's start, and the ones to come (a later redraw may revise those)
  for (const [k] of seen) if (Math.abs(k - lap0) > laps.length + 2) seen.delete(k)
  seen.set(lap0, start0)
  for (const c of laps) seen.set(Math.floor(x(c + 0.01) / LOOP), c)
  const setOff = (t: number): number => laps.filter(c => c <= t).pop() ?? start0
  const out = (t: number): boolean => isOut(hours, setOff(t)) && !(rain === 'home' && isRaining(setOff(t)))
  const dashes: Dash[] = rainStarts(t0 - DASH_BACK, t0 + HORIZON).flatMap(r => {
    // a shower that began before this redraw is seen from now, on the lap they are on now
    const a = Math.max(r, t0)
    if (!out(a) || isRaining(setOff(a))) return []          // not out, or out with an umbrella
    if (setOff(a) > r) return []                           // set off after it: the shower had passed
    const p = wrap(x(a), LOOP)
    const end = lapEnds(a)[0] ?? a + 2 * HORIZON
    const base = speedAt(a)
    const exitBy = (s: number): number => {
      const q = p + s * RUN_SPEED * (a - r)                 // where the run has got them by now
      return a + (s > 0 ? (LOOP - q) / (base + s * RUN_SPEED) : q / -(base + s * RUN_SPEED))
    }
    // the way they are going; or, with the path carrying them back near the other edge, that way
    const s = exitBy(dir) < end - 0.1 ? dir : Math.sign(base) || dir
    const exit = exitBy(s)
    return end > exit + 0.1 && end > t0 ? [{ r, exit, end, s }] : []
  })
  return { x, setOff, out, dashes, walk, laps }
}

// The run itself: one shared animation going at RUN_SPEED (1000 s of it would carry them 60000 px),
// played from the shower for just the part of it till the lap is over. They go on running once
// off the scene, unseen, and at the lap's end the animation is over and they are back on their walk.
const RUN_KEYFRAMES = `@keyframes rr{to{translate:${RUN_SPEED * 1000}px}}@keyframes rl{to{translate:-${RUN_SPEED * 1000}px}}`
const runAnimation = (t0: number, d: Dash): string =>
  `${d.s > 0 ? 'rr' : 'rl'} 1000s linear ${(d.r - t0).toFixed(2)}s ${((d.end - d.r) / 1000).toFixed(5)}`

// A walker shows for the laps they set off on while out, and not in the rain if they would rather
// stay home; one who goes out in it carries an umbrella for the laps they set off on in the rain,
// and one caught out by a shower runs off. A lap is one pass across the scene, so they only ever
// come, go or change off screen. Laps are counted on the path as it stood at this redraw, so the
// plan holds however the path moves.
function walkerHours(t0: number, ran0: number, go: Go): string {
  return WALKERS.map(w => {
    const { i, hours, rain } = w
    const { setOff, out, dashes, laps } = walkerPlan(w, t0, ran0, go)
    const cuts = [...laps, ...dashes.flatMap(d => [d.r, d.exit, d.end])]
    const plan = (cls: string, seen: (t: number) => boolean, also = ''): string => {
      const frames = timeline(cls, t0, cuts, seen)
      const anims = [frames === null ? '' : `${cls} ${HORIZON}s steps(1,end) infinite`, also].filter(Boolean)
      return anims.length ? `.${cls}{animation:${anims.join(',')}}${frames ?? ''}` : ''
    }
    const gone = (t: number): boolean => dashes.some(d => t >= d.exit && t < d.end)
    const run = dashes.map(d => runAnimation(t0, d)).join(',')
    let css = plan(`wn${i}`, t => out(t) && !gone(t), run)
    if (rain === 'umbrella') {
      const wet = plan(`ww${i}`, t => isRaining(setOff(t)))
      // the umbrella shows only if some lap is wet; the dry frames step aside for it
      if (wet.includes('opacity:1')) css += wet + plan(`wd${i}`, t => !isRaining(setOff(t)))
    }
    return css
  }).join('')
}

// How far ahead a redraw plans who comes to each stage. The band is redrawn every half minute
// while it is in view, so this only has to outlast a while out of sight; past it the park empties.
const VISIT_WINDOW = 360
// The cast's plan for the weather as it is, or as a demo forces it: one plan for each.
const casts = new Map<string, Park>()
function castNow(): Park {
  const key = `${sky.season ?? ''}|${sky.weather ?? ''}`
  let park = casts.get(key)
  if (park === undefined) {
    const forced = { ...sky }
    park = makePark(t => isWet(weatherAt(t, forced)))
    casts.set(key, park)
  }
  return park
}

// Who shows on a stage, as keyframes of its variant number --w over VISIT_WINDOW seconds from
// `t0` (0: nobody), only marking changes: `cuts` are the times anything could change.
function whoTimeline(name: string, t0: number, cuts: number[], who: (t: number) => number): string | null {
  const end = t0 + VISIT_WINDOW
  const ends = [...cuts.filter(t => t > t0 && t < end), end].sort((x, y) => x - y)
  let from = t0
  let last = -1
  let frames = ''
  for (const to of ends) {
    const w = who((from + to) / 2)
    if (w !== last) {
      frames += `${(((from - t0) / VISIT_WINDOW) * 100).toFixed(2)}%{--w:${w}}`
      last = w
    }
    from = to
  }
  // nobody the whole time: nothing to write. Otherwise held to the end, and once the window is
  // over the stage's own --w:0 comes back.
  return last === 0 && !frames.includes('}', frames.indexOf('}') + 1) ? null : `@keyframes ${name}{${frames}}`
}

// A visitor keeps to their copy of the park's tile: out of its gate, a stop, back in. Each visit
// is a beat of the stage, two a period on alternate copies, and the cast's plan says who (if
// anyone) comes on it. The park's wrap moves each copy on by one, so a beat keeps its copy in view
// and nobody changes into someone else; who comes changes only while nobody is there.
// The wraps are counted from the park's very start, not from this redraw, so the next redraw
// numbers the copies the same way however far the park has gone between them.
// Who the last visitorHours shows on each stage: its variant numbers. defsFor draws only them.
let shownLast: Map<number, Set<number>> = new Map()

function visitorHours(t0: number, ran0: number, go: Go): string {
  const shown = new Map<number, Set<number>>()
  shownLast = shown
  const park = LAYERS.find(layer => layer.cls === 'lp')
  const tile = park?.tile ?? 640
  const parkV = park?.speed ?? 0
  const ranAt = (t: number): number => ran0 + (go === null ? 0 : Math.max(0, t - t0 - go))
  const wraps = go === null ? [] : crossings(t0 + go, ran0 * parkV, parkV, tile)
  const vars: string[][] = VISIT_COPIES.map(() => [])
  let css = ''
  const cast = castNow()
  for (const { i, period } of VISITORS) {
    const off = visitOffset(i, period)
    const cycles = crossings(t0, t0 + off, 1, period)
    VISIT_COPIES.forEach((k, c) => {
      const beat = (t: number): number =>
        2 * Math.floor((t + off) / period) + (((k + Math.floor((ranAt(t) * parkV) / tile)) % 2) + 2) % 2
      const name = `h${i}u${c}`
      const seen = new Set<number>()
      const frames = whoTimeline(name, t0, [...cycles, ...wraps], t => {
        const w = cast.variantAt(i, beat(t))
        if (w > 0) seen.add(w)
        return w
      })
      if (frames === null) return
      for (const w of seen) shown.set(i, (shown.get(i) ?? new Set()).add(w))
      css += frames
      vars[c]!.push(`--h${i}:${name}`)
    })
    if (vars.some(v => v.some(x => x.startsWith(`--h${i}:`)))) css += `.h${i}{animation-name:var(--h${i})}`
  }
  const stages = VISITORS.map(({ i }) => `.h${i}`).join()
  return `${stages}{--w:0;animation:${VISIT_WINDOW}s steps(1,end) forwards}` + css + vars.map((v, c) => (v.length ? `.u${c}{${v.join(';')}}` : '')).join('')
}

const AMBIENT_CYCLE = 1_000_000

// Walkers and bench visitors keep their own clock, so a redraw finds each one where it was.
function peopleStyle(nowMs: number, ranMs: number, go: Go): string {
  const t0 = nowMs / 1000
  const visitors = VISITORS.map(
    ({ i, period }) => `.v${i}{--vd:-${wrap(t0 + visitOffset(i, period), period).toFixed(1)}s}`,
  )

  // The far train keeps the wall clock too, so a redraw does not send a new one across; and so
  // does the day, with its sky, sun and moon, clock and lamps.
  const train = `.tr,.trb{animation-delay:-${wrap(t0, TRAIN_PERIOD).toFixed(1)}s}`
  const day = `.dn{animation-delay:-${wrap(t0, DAY).toFixed(1)}s}`

  // The park's little loops (twinkles, lamps, fountain, petals, legs, talk) keep the wall clock
  // too: each adds --t to its own offset, so a redraw carries them on rather than starting them
  // over. Counted on a long cycle to keep the number short; it turns over every 11 days or so.
  const loops = `svg{--t:${wrap(t0, AMBIENT_CYCLE).toFixed(2)}s}`

  return (
    loops +
    walkerStyle(nowMs, ranMs, go) +
    visitors.join('') +
    train +
    day +
    weatherStyle(t0) +
    seasonStyle(t0) +
    walkerHours(t0, ranMs / 1000, go) +
    visitorHours(t0, ranMs / 1000, go)
  )
}

// ---------- the season and the weather, drawn ----------

// The park's own style, less the weather's old fixed clock: each drawing writes the weather now.
const BASE_STYLE = PARK_STYLE
  .replace(/\.wx\{[^}]*\}/, '')
  .replace(/\.rain\{opacity:0;animation-name:rain\}@keyframes rain\{.*?\}\}/, '')
  .replace(/\.rcl\{opacity:0;animation-name:rcl\}@keyframes rcl\{.*?\}\}/, '')

// What follows the sun rather than the clock: the sky, dawn and dusk, the daylight, the sun and
// the moon, the lamps and the fireflies. The art keys them to a day with the sun up at 6 and down
// at 18; each drawing moves their marks to the day's own sunrise and sunset (sunHours). The clock,
// people's hours, the train and the windows keep to the clock.
const SOLAR = /@keyframes (?:moon|sun|dsky|dusk|dlt|nl|ffy)\{(?:[\d.]+%\{[^}]*\})*\}/g
const SUN_STYLES = new Map<string, string>()
function sunStyle(t0: number): string {
  // (to a hundredth of an hour: the sun's day lengthens or shortens by at most that between two
  // redraws, so a redraw moves the sun and moon by well under a pixel)
  const [rise, set] = sunHours(t0, sky).map(h => Math.round(h * 100) / 100) as [number, number]
  const key = `${rise},${set}`
  let style = SUN_STYLES.get(key)
  if (style === undefined) {
    style = BASE_STYLE.replace(SOLAR, frames =>
      frames.replace(/([\d.]+)%\{/g, (_, pct: string) => `${+((solarHour((Number(pct) / 100) * 24, rise, set) / 24) * 100).toFixed(3)}%{`))
    if (SUN_STYLES.size > 20) SUN_STYLES.clear()
    SUN_STYLES.set(key, style)
  }
  return style
}

// The <g> opening with `open` cut out of the markup, as often as it comes.
function cutGroups(markup: string, open: string): string {
  for (let i = markup.indexOf(open); i >= 0; i = markup.indexOf(open)) markup = markup.slice(0, i) + markup.slice(closeOf(markup, i))
  return markup
}

// Specks in a pattern tile: 1 px dots (or w px wide), and 2 px flakes.
const specks = (colour: string, points: readonly (readonly [number, number])[], w = 1): string =>
  `<path stroke="${colour}" d="${points.map(([x, y]) => `M${x} ${y + 0.5}h${w}`).join('')}"/>`
const flakes = (colour: string, points: readonly (readonly [number, number])[]): string =>
  `<path fill="${colour}" d="${points.map(([x, y]) => `M${x} ${y}h2v2h-2z`).join('')}"/>`
const tile = (id: string, w: number, inner: string): string =>
  `<pattern id="${id}" width="${w}" height="44" patternUnits="userSpaceOnUse">${inner}</pattern>`

// Snow: near flakes (some 2 px) and far ones, falling and swaying; a blizzard drives both
// slantwise, fast, behind a white haze. Autumn's leaves blow across the whole band.
const SNOW_DEFS =
  tile('sn', 60, specks('#f4f8ff', [[31, 6], [48, 15], [9, 20], [24, 29], [13, 38], [44, 41]]) + flakes('#f4f8ff', [[4, 2], [17, 11], [38, 24], [54, 33]])) +
  tile('sf', 48, specks('#aab6d0', [[7, 4], [30, 9], [18, 16], [41, 21], [3, 27], [26, 33], [12, 39], [37, 42]]))
const LEAF_DEFS = tile('lf', 160,
  specks('#e0603a', [[12, 5], [145, 20]], 2) + specks('#c0402a', [[70, 12], [96, 30]], 2) + specks('#ffd24a', [[118, 3], [20, 38]], 2) + specks('#f08a4a', [[40, 24]], 2))
const SNOW_FRONT =
  '<g class="snw"><g class="sfb"><rect class="sw" x="-8" y="-88" width="1030" height="132" fill="url(#sf)"/></g>' +
  '<g class="sfa"><rect class="sw" x="-8" y="-88" width="1030" height="132" fill="url(#sn)"/></g></g>'
const BLIZZARD_FRONT =
  '<g class="hvy"><g class="sfc"><rect class="sw" x="-38" y="-88" width="1030" height="132" fill="url(#sn)"/></g></g><g class="bzw"><rect y="-12" width="960" height="56" fill="#cdd5e4" opacity=".22"/>' +
  '<g class="bza"><rect y="-88" width="1020" height="132" fill="url(#sn)"/></g><g class="bzb"><rect y="-88" width="1008" height="132" fill="url(#sf)"/></g></g>'
const LEAF_FRONT = '<g class="lfa"><rect y="-88" width="1120" height="132" fill="url(#lf)"/></g>'
const SNOW_CSS = '@keyframes sfa{to{transform:translateY(44px)}}@keyframes sw{to{transform:translateX(4px)}}.sfb{opacity:.6}'
// The snow's sway, to and fro over 6 s, on the wall clock like the rest, so a redraw carries it on.
const swayOn = (t0: number): string => `.sw{animation:sw 3s ease-in-out -${wrap(t0, 6).toFixed(2)}s infinite alternate}`
const BLIZZARD_CSS = '@keyframes bza{to{transform:translate(-60px,44px)}}@keyframes bzb{to{transform:translate(-48px,44px)}}'
const LEAF_CSS = '@keyframes lfa{to{transform:translate(-160px,44px)}}'
const STILL_CSS = '@media (prefers-reduced-motion: reduce){.sfa,.sfb,.sfc,.bza,.bzb,.lfa,.sw{animation:none}}'

// How far ahead a drawing plans the weather; past it the last weather holds till the next redraw.
const WX_WINDOW = 600

// Each season's templates but spring's, by id, swapped in for their own: short sleeves in summer,
// long sleeves and thin scarves in autumn, everyone dressed for the cold in winter.
const dressed = (markup: string): Map<string, string> => new Map([...classed(markup).matchAll(/<g id="(\w+)">(.*?)<\/g>/g)].map(m => [m[1]!, m[0]] as const))
const DRESS = new Map<string, Map<string, string>>([['summer', dressed(PARK_SUMMER_DEFS)], ['autumn', dressed(PARK_AUTUMN_DEFS)], ['winter', dressed(PARK_WINTER_DEFS)]])
const DRESS_STYLE: Record<string, string> = { summer: PARK_SUMMER_STYLE, autumn: PARK_AUTUMN_STYLE }
const TEMPLATE = /<g id="(\w+)">(?:<path[^>]*\/>)*<\/g>/g

type Art = { back: string; front: string; defs: (defs: string) => string }
const ARTS = new Map<string, Art>()

// What the park looks like from `t`: its season, the weathers due in the window, and the art for
// them. Petals fall only in spring, fireflies come out only in summer, leaves only in autumn; rain and snow are drawn only when due.
function lookAt(t: number) {
  const season = seasonAt(t, sky)
  const seen = new Set<Weather>([weatherAt(t - 60, sky), weatherAt(t, sky)])
  for (const c of weatherChanges(t, t + WX_WINDOW, sky)) seen.add(weatherAt(c + 0.01, sky))
  const look = {
    season,
    winter: season === 'winter',
    petals: season === 'spring',
    fireflies: season === 'summer',
    leaves: season === 'autumn',
    rain: seen.has('rain'),
    snow: seen.has('snow') || seen.has('blizzard'),
    blizzard: seen.has('blizzard') || blizzardAt(t, HEAVY) > 0,
  }
  const key = JSON.stringify(look)
  let art = ARTS.get(key)
  if (art === undefined) {
    let back = ART_BACK
    let front = ART_FRONT
    let extra = ''
    if (!look.petals) front = cutGroups(front, '<g class="lp"><use href="#pet"')
    if (!look.fireflies) back = cutGroups(back, '<g class="ffy dn">')
    if (!look.rain) {
      back = cutGroups(back, '<g class="rain wx">')
      front = cutGroups(front, '<g class="rain wx">')
    }
    if (look.snow) {
      front += SNOW_FRONT
      extra += SNOW_DEFS
    }
    if (look.blizzard) front += BLIZZARD_FRONT
    if (look.leaves) {
      front += LEAF_FRONT
      extra += LEAF_DEFS
    }
    const defs = (markup: string): string => {
      let out = markup
      if (!look.petals) out = out.replace(/<g id="pet">.*?<\/g>/, '')
      if (!look.fireflies) out = cutGroups(out, '<g id="ffl">')
      if (!look.rain) out = out.replace(/<pattern id="(?:rf|rn|spl)".*?<\/pattern>/g, '')
      // everyone dressed for the season
      const dress = DRESS.get(look.season)
      if (dress !== undefined) out = out.replace(TEMPLATE, (whole, id: string) => dress.get(id) ?? whole)
      // the bare tree, the snow lying and the beds and fountain asleep only in winter
      // (the crown, the flowers and the fountain's jet, hidden in winter, not drawn at all)
      out = look.winter
        ? out.replace(CROWN_PATHS, '').replace(/<g class="(?:flw|fjet|fw[012])">.*?<\/g>/g, '')
        : out.replace(/<g class="(?:wtr|sg1|sg2)">.*?<\/g>/g, '')
      return extra === '' ? out : out.replace(/<\/defs>$/, `${extra}</defs>`)
    }
    art = { back, front, defs }
    ARTS.set(key, art)
  }
  return { ...look, ...art }
}

// A layer's opacity as the weather goes, over WX_WINDOW from `t0`: `of` the level for each
// weather, fading `ramp` seconds from each change.
function level(cls: string, t0: number, of: (w: Weather) => number, ramp: number, plus = (_: number): number => 0, more: readonly number[] = []): string {
  const at = (t: number): number => {
    const now = of(weatherAt(t, sky))
    const c = weatherChanges(t - ramp, t + 0.001, sky).filter(x => x <= t && x > t - ramp).pop()
    if (c === undefined) return now + plus(t)
    const was = of(weatherAt(c - 0.01, sky))
    return was + (now - was) * ((t - c) / ramp) + plus(t)
  }
  const marks = new Set([t0, t0 + WX_WINDOW, ...more])
  for (const c of weatherChanges(t0 - ramp, t0 + WX_WINDOW, sky)) {
    for (const m of [c, c + ramp]) if (m > t0 && m < t0 + WX_WINDOW) marks.add(m)
  }
  const points = [...marks].sort((x, y) => x - y).map(m => [m, Math.round(at(m) * 100) / 100] as const)
  if (points.every(([, v]) => v === points[0]![1])) return `.${cls}{opacity:${points[0]![1]}}`
  const frames = points.map(([m, v]) => `${(((m - t0) / WX_WINDOW) * 100).toFixed(2)}%{opacity:${v}}`).join('')
  return `.${cls}{animation:${cls}x ${WX_WINDOW}s linear forwards}@keyframes ${cls}x{${frames}}`
}

// A blizzard builds up and dies down rather than coming and going at once: [how long before it
// (and after) it starts to (and stops), how long into it (and before its end) it is at its
// height]. Its own slanting snow and haze go with BLIZZARD; heavier ordinary snow with HEAVY,
// longer, so the snow thickens before it and eases off after.
const BLIZZARD = [40, 10] as const
const HEAVY = [120, 30] as const

// The blizzards' spells near `t`: [from, to] in seconds.
function blizzards(t: number): [number, number][] {
  const out: [number, number][] = []
  const cs = weatherChanges(t - 300, t + 300, sky)
  cs.forEach((c, k) => {
    if (weatherAt(c + 0.01, sky) === 'blizzard') out.push([c, cs[k + 1] ?? c + 300])
  })
  if (weatherAt(t - 300, sky) === 'blizzard') out.unshift([t - 600, cs[0] ?? t + 300])
  return out
}

// How strong a blizzard is at `t`, 0..1, by the given ramp.
function blizzardAt(t: number, [early, full]: readonly [number, number]): number {
  if (sky.weather) return sky.weather === 'blizzard' ? 1 : 0
  const clamp = (x: number): number => Math.max(0, Math.min(1, x))
  return Math.max(0, ...blizzards(t).map(([a, b]) => Math.min(clamp((t - a + early) / (early + full)), clamp((b + early - t) / (early + full)))))
}

// The times in the drawing's window where that strength turns: it is straight between them. The
// blizzards looked for reach back before the window as well as across it: one that ended just
// before it still has its tail to ease off inside it (missed, the haze faded over the whole
// window instead, and dropped away at the next redraw).
function blizzardMarks(t0: number, [early, full]: readonly [number, number]): number[] {
  const marks = [t0, t0 + WX_WINDOW].flatMap(t => blizzards(t)).flatMap(([a, b]) => [a - early, a + full, b - full, b + early])
  return [...new Set(marks)].filter(m => m > t0 && m < t0 + WX_WINDOW)
}

// A layer's opacity as strong as the blizzard, over the drawing's window.
function ramp(cls: string, t0: number, r: readonly [number, number]): string {
  return level(cls, t0, () => 0, 1, t => blizzardAt(t, r), blizzardMarks(t0, r))
}

// A loop on the wall clock, so a redraw carries it on.
const loopOn = (cls: string, name: string, seconds: number, steps: number, t0: number): string =>
  `.${cls}{animation:${name} ${seconds}s steps(${steps}) -${wrap(t0, seconds).toFixed(2)}s infinite}`

// The weather's layers for this drawing: the clouds' shade, rain, snow, a blizzard, autumn leaves.
function weatherStyle(t0: number): string {
  const look = lookAt(t0)
  const shade = { clear: 0, rain: 0.7, snow: 0.25, blizzard: 0.25 } as const
  // (a blizzard's darker sky comes and goes with it, over the snow's)
  let css = level('rcl', t0, w => shade[w], 60, t => 0.35 * blizzardAt(t, BLIZZARD), blizzardMarks(t0, BLIZZARD))
  if (look.rain) css += level('rain', t0, w => (w === 'rain' ? 1 : 0), 15)
  if (look.snow) {
    css += level('snw', t0, w => (w === 'snow' || w === 'blizzard' ? 1 : 0), 20) + SNOW_CSS + swayOn(t0) +
      loopOn('sfa', 'sfa', 7, 44, t0) + loopOn('sfb', 'sfa', 11, 44, t0)
  }
  if (look.blizzard) {
    css += ramp('bzw', t0, BLIZZARD) + ramp('hvy', t0, HEAVY) + BLIZZARD_CSS +
      loopOn('bza', 'bza', 1.4, 44, t0) + loopOn('bzb', 'bzb', 2, 44, t0) + loopOn('sfc', 'sfa', 5, 44, t0)
  }
  if (look.leaves) css += LEAF_CSS + loopOn('lfa', 'lfa', 9, 88, t0)
  // the fireflies keep in out of the rain, and come out again after it
  if (look.fireflies) css += level('ffr', t0, w => (w === 'clear' ? 1 : 0), 30)
  if (look.snow || look.leaves) css += STILL_CSS
  return css
}

// The colours a season paints: the cherry tree's four tones and its white blossoms, then the
// hedge and its highlights. Spring is the park as drawn.
const SEASON_BASE = ['#d65c98', '#f07cb4', '#ff9cc8', '#ffb7d5', '#fff4f9', '#0f2a2e', '#17403f'] as const
const PALETTES: Readonly<Record<Season, readonly string[]>> = {
  spring: SEASON_BASE,
  summer: ['#1f5a3a', '#2e7a48', '#44a058', '#6cc070', '#9ad88a', '#0a2a1c', '#11402a'],
  autumn: ['#8a2a1e', '#c0402a', '#e0603a', '#f08a4a', '#ffd24a', '#3a3418', '#5a4a20'],
  winter: ['#6c7488', '#9aa2b8', '#c4cad8', '#e6eaf2', '#ffffff', '#3e3a3a', '#5a5450'],
}
// The last two of the park's hours of a season, its colours turn to the next one's.
const TURN = DAY / 12

// How each colour is painted in the art (a class, a stroke, a fill), with % for the new colour.
const ART_ALL = [PARK_DEFS, PARK_BACK, PARK_MID, PARK_FRONT].join('')
const REPAINT = SEASON_BASE.map(base => paintAs(base, '%'))

// The rules that paint a colour of the art another: by its class where it has one, else by the
// colour itself, `within` the given scope.
function paintAs(base: string, colour: string, within = ''): string[] {
  return (['stroke="', 'style="fill:'] as const).flatMap(kind => {
    const prop = kind === 'stroke="' ? 'stroke' : 'fill'
    const name = PAINT_CLASS.get(kind + base)
    if (name !== undefined) return [`${within}.${name}{${prop}:${colour}}`]
    if (!ART_ALL.includes(`<path ${kind}${base}"`)) return []
    return [prop === 'stroke' ? `${within}[stroke="${base}"]{stroke:${colour}}` : `${within}[style="fill:${base}"]{fill:${colour}!important}`]
  })
}

const mixColour = (a: string, b: string, f: number): string =>
  `#${[1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(b.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('')}`

// The season's colours at `t0`, turning to the next season's at its end (not in a demo).
export function seasonColours(t0: number): readonly string[] {
  const season = seasonAt(t0, sky)
  const colours = PALETTES[season]
  const left = seasonEnd(t0) - t0
  if (sky.season || left >= TURN) return colours
  const next = PALETTES[SEASONS[(SEASONS.indexOf(season) + 1) % 4]!]
  return colours.map((c, k) => mixColour(c, next[k]!, 1 - left / TURN))
}

// The CROWN first colours are the cherry tree's crown: winter hides it, for the bare tree.
const CROWN = 5
// The crown's runs and blocks in the art: a winter drawing leaves them out.
const CROWN_PATHS = new RegExp(`<path (?:${SEASON_BASE.slice(0, CROWN).flatMap(base =>
  (['stroke="', 'style="fill:'] as const).map(kind => (PAINT_CLASS.has(kind + base) ? `class="${PAINT_CLASS.get(kind + base)}"` : `${kind}${base}"`))).join('|')}) d="[^"]*"/>`, 'g')
// Winter's own colours: the beds' leaves dark bushes, the fountain's water ice, the cyclist's
// clothes darker.
const WINTER_PAINT = PARK_WINTER_PAINT.flatMap(([base, colour, within]) => paintAs(base, colour, within)).join('')

function seasonStyle(t0: number): string {
  const colours = seasonColours(t0)
  const season = seasonAt(t0, sky)
  const winter = season === 'winter'
  const paint = (k: number): string => (winter && k < CROWN ? 'none' : colours[k]!)
  return SEASON_BASE.map((base, k) => (paint(k) === base ? '' : REPAINT[k]!.map(f => f.replace('%', paint(k))).join(''))).join('') +
    (winter ? PARK_WINTER_STYLE + WINTER_PAINT + snowStyle(t0) : DRESS_STYLE[season] ?? '')
}

// The snow lying on things, as deep as it is over the drawing's window: a dusting (sg1) shows
// first, the full cover (sg2) once it is deep. Sampled every half park hour, the flat runs kept
// to their ends.
const SNOW_LAYERS = [
  ['sg1', (d: number): number => Math.min(1, d * 2.5)],
  ['sg2', (d: number): number => Math.max(0, Math.min(1, (d - 0.3) / 0.7))],
] as const

function snowStyle(t0: number): string {
  return SNOW_LAYERS.map(([cls, of]) => {
    const points: (readonly [number, number])[] = []
    for (let s = 0; s <= WX_WINDOW; s += 30) points.push([s, Math.round(of(snowDepth(t0 + s, sky)) * 100) / 100])
    if (points.every(([, v]) => v === points[0]![1])) return `.${cls}{opacity:${points[0]![1]}}`
    const kept = points.filter(([, v], k) => k === 0 || k === points.length - 1 || v !== points[k - 1]![1] || v !== points[k + 1]![1])
    const frames = kept.map(([s, v]) => `${((s / WX_WINDOW) * 100).toFixed(2)}%{opacity:${v}}`).join('')
    return `.${cls}{animation:${cls}x ${WX_WINDOW}s linear forwards}@keyframes ${cls}x{${frames}}`
  }).join('')
}

// The band's corners, rounded like the frame around it, in CSS pixels as drawn (not art pixels),
// so they stay round however much of the scene's sides the band's width crops.
const CORNER = 'svg{clip-path:inset(0 round 10px)}'
// The park's tiles glide by in fractions of a pixel; the people and petals drawn over them go
// the same way (not snapped pixel by pixel), so nobody judders against the path or the frame.
// Only while it moves: smoothed, a person's pixels part a little where two colours meet, and
// the scene behind shows through (an eye, say), so a still park is drawn sharp. The petals fall
// smoothly then too, not a pixel at a time: stepped while the park glides under them, they jerk.
// (.pt.pt: over the park's own stepped .pt, which comes after; no ancestor, as they are in a <use>.)
const GLIDE = '.lp,.w{shape-rendering:geometricPrecision}.pt.pt{animation-timing-function:linear}'

// The style block written short, to keep the band under the Svg size limit: `step-end` for the
// one-step timing it is the name of, and numbers without the zeros that change nothing
// (0.120s -> .12s, 20.000% -> 20%).
export function shortCss(css: string): string {
  const plan = `${HORIZON}s steps(1,end) infinite`
  return `${css.replaceAll(plan, 'var(--P)')}svg{--P:${plan}}`
    .replaceAll('steps(1,end)', 'step-end')
    .replace(/(?<![\w.])(\d+)\.(\d+)/g, (_, whole: string, frac: string) => {
      const f = frac.replace(/0+$/, '')
      const w = whole.replace(/^0+(?=\d)/, '')
      return f === '' ? w : `${w === '0' ? '' : w}.${f}`
    })
}

// The whole band: the park at its scroll, its people, and the cat in its spot.
function scene(move: readonly Step[], moveMs: number, ranMs: number, go: Go, nowMs: number): string {
  const cat = catMove(move, moveMs)
  // (the style first: it plans who comes, and the defs draw only them)
  const look = lookAt(nowMs / 1000)
  const style = shortCss(CORNER + (go === null ? '' : GLIDE) + sunStyle(nowMs / 1000) + PAINT_CSS + CAT_STYLE + cat.css + layerStyle(ranMs, go) + peopleStyle(nowMs, ranMs, go))

  const draw = (shown: Map<number, Set<number>>): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -${PARK_TOP} ${PARK_W} ${PARK_H + PARK_TOP}" width="${PARK_W * SCALE}" height="${(PARK_H + PARK_TOP) * SCALE}" ` +
    `shape-rendering="crispEdges" preserveAspectRatio="xMidYMax slice">` +
    `<style>${style}</style>` +
    `${look.defs(defsFor(shown))}${look.back}${ART_MID}${cat.svg}${look.front}</svg>`
  const source = draw(shownLast)
  // Past the app's limit the band would not be drawn at all: first the fireflies and the falling
  // petals go (only there to look at), then if need be the visitors: an empty park beats no park.
  if (source.length <= SVG_LIMIT) return source
  const plain = withoutExtras(source)
  return plain.length <= SVG_LIMIT ? plain : withoutExtras(draw(new Map()))
}
const SVG_LIMIT = 131_072

// A drawing without its fireflies and falling petals.
function withoutExtras(svg: string): string {
  for (const open of ['<g class="ffy dn">', '<g id="ffl">', '<g class="lp"><use href="#pet"', '<g id="pet">']) svg = cutGroups(svg, open)
  return svg
}

// The band last drawn, and what it was drawn from. Every redraw is drawn from now: the app starts a
// drawing's animations over each time it puts the band up, even the very same text, so a drawing
// handed back from earlier would set the whole park back to when it was drawn (in v0.35.5 to 0.36.2,
// a jump back of up to a minute at each fresh tick). Only one asked for again at the same moment,
// from the same state, is the same picture and handed back as it was.
let lastBand: { key: string; fresh: number; at: number; source: string } | null = null

function sameOrNew(key: string, fresh: number, now: number, make: () => string): string {
  if (lastBand !== null && lastBand.key === key && lastBand.fresh === fresh && now === lastBand.at) return lastBand.source
  const source = make()
  lastBand = { key, fresh, at: now, source }
  return source
}

// ---------- state ----------

// The pending nap. A reload starts it over, from session.start.
let restTimer: Timer | undefined
// The redraw due once a waking cat has got up.
let wakeTimer: Timer | undefined
// The redraw due when standing about moves on to its second part.
let idleTimer: Timer | undefined
// The next fresh plan.
let freshTimer: Timer | undefined
// The end of a run held on after a short task.
let finishTimer: Timer | undefined

async function cancelFinish($: EngineInterface): Promise<void> {
  finishTimer?.cancel()
  finishTimer = undefined
  await update($, finishAt, () => null)
}

// The run is banked and the cat comes to a stand the given way; it settles down after REST_AFTER_MS.
async function endRun($: EngineInterface, intro: Intro): Promise<void> {
  const now = await $.clock.now()
  const startedAt = await read($, runStartedAt)
  if (startedAt !== null) {
    await update($, runMs, ms => ms + Math.max(0, now - startedAt))
    await update($, runStartedAt, () => null)
  }
  await update($, wokeAt, () => null)
  await update($, finishAt, () => null)
  await standUp($, intro)
  await wake($, true)
}

function freshen($: EngineInterface): void {
  freshTimer?.cancel()
  freshTimer = $.clock.after(FRESH_MS, async () => {
    void update($, freshTick, n => n + 1)
    freshen($)
  })
}

// When the band first drew the cat standing after it came to a stand: the app may hold the band
// on the run a moment after the task ends, and braking and jumping for joy are over in 1.3 s, so
// standing about starts from what is first seen. null until then.
let standSeenAt: number | null = null

// The redraw due when standing about moves on to its second part, `ms` from now.
function nextPart($: EngineInterface, ms: number): void {
  idleTimer?.cancel()
  idleTimer = $.clock.after(ms, () => {
    idleTimer = undefined
    void update($, idleTick, n => n + 1)
  })
}

// The cat comes to a stand, the given way, and stands about from here.
async function standUp($: EngineInterface, intro: Intro): Promise<void> {
  const now = await $.clock.now()
  standSeenAt = null
  await update($, idleSince, () => now)
  await update($, idleIntro, () => intro)
  nextPart($, leadMs(standFirst(intro)))
}

// Begins the cat's settling down: look around, sit, lie down, sleep.
async function settle($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, restSince, () => now)
  await update($, isResting, () => true)
}

// Wakes the cat and, when `isCounting`, starts counting toward its nap again.
async function wake($: EngineInterface, isCounting: boolean): Promise<void> {
  restTimer?.cancel()
  restTimer = undefined
  await update($, isResting, () => false)

  if (isCounting) {
    restTimer = $.clock.after(REST_AFTER_MS, () => {
      restTimer = undefined
      void settle($)
    })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    forgetSetOffs()
    await cancelFinish($)
    await update($, runStartedAt, () => null)
    await update($, wokeAt, () => null)
    await standUp($, 'still')
    await wake($, true)
    freshen($)
    await update($, demoSeason, () => null)
    await update($, demoWeather, () => null)
    // (a host with no slash commands still has the park)
    await $.command
      .register({
        name: 'running-cat',
        description: 'Show the park in another season or weather, for a demo (this session only)',
        argumentHint: 'season <spring|summer|autumn|winter|auto> | weather <clear|rain|snow|blizzard|auto>',
        immediate: true,
      })
      .catch(() => undefined)

    return result
  })

  // A demo: the park in another season, or another weather, till `auto` or a new session.
  on('command.run', { command: 'running-cat' }, async ($, e) => {
    const [what = '', value = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const now = (await $.clock.now()) / 1000
    if (what === 'season' && (value === 'auto' || (SEASONS as readonly string[]).includes(value))) {
      await update($, demoSeason, () => (value === 'auto' ? null : (value as Season)))
    } else if (what === 'weather' && (value === 'auto' || (WEATHERS as readonly string[]).includes(value))) {
      await update($, demoWeather, () => (value === 'auto' ? null : (value as Weather)))
    } else if (what !== '') {
      return { text: 'Usage: /running-cat season <spring|summer|autumn|winter|auto> | weather <clear|rain|snow|blizzard|auto>', isTextDisplayOnly: true }
    }
    const forced: Sky = { season: await read($, demoSeason), weather: await read($, demoWeather) }
    const season = seasonAt(now, forced)
    const day = Math.floor(seasonHour(now) / 24) + 1
    return {
      text:
        `Park: ${season}${forced.season ? ' (demo)' : ''}, day ${day} of 4; weather ${weatherAt(now, forced)}${forced.weather ? ' (demo)' : ''}.` +
        (forced.season || forced.weather ? ' `/running-cat season auto` and `weather auto` go back to the park\'s own.' : ''),
      isTextDisplayOnly: true,
    }
  })

  // A new task starts the run: a napping cat gets up and stretches first, an awake one walks a few
  // steps. A message sent while it already runs keeps it running.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    const wasResting = await read($, isResting)
    // a new task while the last one's run is held on: it just keeps running
    if (finishTimer !== undefined) await cancelFinish($)
    if ((await read($, runStartedAt)) === null) {
      const lead = wasResting ? WAKE_MS : START_MS
      await update($, wokeAt, () => now)
      await update($, wasNapping, () => wasResting)
      // the park holds still until it starts to run
      await update($, runStartedAt, () => now + lead)
      wakeTimer?.cancel()
      wakeTimer = $.clock.after(lead, () => {
        wakeTimer = undefined
        void update($, wakeDone, n => n + 1)
      })
    }
    idleTimer?.cancel()
    idleTimer = undefined
    await wake($, false)

    return next(e)
  })

  // When the task ends the run is banked and the cat brakes to a stand, jumping for joy when the
  // task came to an answer; it settles down after REST_AFTER_MS. An answer come before the cat
  // has run MIN_RUN_MS (still getting up, or a step or two into its run) has it run on till then
  // first; a stopped task stops it at once. A subagent's turn is not the task.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      return result
    }
    const now = await $.clock.now()
    const startedAt = await read($, runStartedAt)
    const intro: Intro = startedAt === null ? 'still' : e.reason === 'answer' ? 'cheer' : 'stop'
    const due = intro === 'cheer' && startedAt !== null ? startedAt + MIN_RUN_MS - now : 0

    if (due > 0) {
      await update($, finishAt, () => now + due)
      finishTimer?.cancel()
      finishTimer = $.clock.after(due, () => {
        finishTimer = undefined
        void endRun($, intro)
      })
    } else {
      await endRun($, intro)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The terminal draws no SVG, and a survey owns the band while it is up.
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.hasSurvey) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    // Read so the fresh plan now and then reaches this hook, and so does a demo's season or weather.
    const fresh = await read($, freshTick)
    sky = { season: await read($, demoSeason), weather: await read($, demoWeather) }
    const now = await $.clock.now()
    const startedAt = await read($, runStartedAt)
    const banked = await read($, runMs)
    // A run still open counts up to now, so a band redrawn before turn.complete stops in place.
    const ranMs = banked + (startedAt === null ? 0 : Math.max(0, now - startedAt))
    const state = `${startedAt}|${banked}|${sky.season}|${sky.weather}`
    const height = (PARK_H + PARK_TOP) * SCALE

    // (a short task's run goes on a moment after the task is done)
    if (e.props.isWorking || (await read($, finishAt)) !== null) {
      const woke = await read($, wokeAt)
      const napping = await read($, wasNapping)
      // Read so the redraw due when the cat has got up reaches this hook.
      const done = await read($, wakeDone)
      const lead = napping ? WAKE : START
      const isGettingUp = woke !== null && now - woke < leadMs(lead)
      const source = sameOrNew(`run|${state}|${woke}|${napping}|${done}|${isGettingUp}`, fresh, now, () =>
        woke === null
          ? scene(RUN, now - (startedAt ?? now), ranMs, 0, now)
          : scene(lead, now - woke, ranMs, isGettingUp ? (leadMs(lead) - (now - woke)) / 1000 : 0, now))

      return <Svg source={source} alt="A pixel cat running through a night park while Claude works" height={height} />
    }

    if (await read($, isResting)) {
      const since = await read($, restSince)
      const source = sameOrNew(`rest|${state}|${since}`, fresh, now, () => scene(SETTLE, now - since, ranMs, null, now))

      return (
        <Svg
          source={source}
          alt="A pixel cat looking around, then lying down for a nap in a night park"
          height={height}
        />
      )
    }

    // Read so the redraw due at the second part of standing about reaches this hook.
    const tick = await read($, idleTick)
    const intro = await read($, idleIntro)
    const since = await read($, idleSince)
    if (standSeenAt === null) {
      // (a stand long past, as after a reload, is not played again)
      standSeenAt = now - since < 5_000 ? now : since
      // first seen later than it came to a stand: the second part comes that much later too
      if (standSeenAt - since > 50) nextPart($, leadMs(standFirst(intro)))
    }
    const stand = standMove(intro, now - standSeenAt)

    const source = sameOrNew(`stand|${state}|${tick}|${intro}|${since}|${standSeenAt}|${stand.move === IDLE_SCRATCH}`, fresh, now, () =>
      scene(stand.move, stand.at, ranMs, null, now))
    return <Svg source={source} alt="A pixel cat sitting in a night park, waiting for a task" height={height} />
  })
}
