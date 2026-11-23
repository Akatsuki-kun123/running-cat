// The park's year: four seasons of four days each, every one starting at 4 in the morning, when
// the park is dark and empty. Each season has its own weather, spell by spell over its four days:
// drizzle in spring, short showers in summer, a little rain in autumn, snow in winter (and now and
// then a short blizzard). Everything here runs on the wall clock, like the park's day, so every
// session sees the same season and the same weather at the same moment.
//
// A demo may force a season (its weather then follows that season's spells at the same point in
// it) or a weather outright: `Sky` says which.

import { DAY } from './park'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Weather = 'clear' | 'rain' | 'snow' | 'blizzard'
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'blizzard']

// A season is four of the park's days (96 minutes); the year is four seasons.
export const SEASON = 4 * DAY
export const YEAR = 4 * SEASON
// Seasons turn at 4 in the morning.
export const SEASON_START = DAY / 6

// What a demo forces, if anything.
export type Sky = { season?: Season | null; weather?: Weather | null }

const wrap = (x: number, m: number): number => ((x % m) + m) % m

// The season at `t` seconds of wall clock, as its number (0 spring .. 3 winter).
export const seasonIndexAt = (t: number): number => Math.floor(wrap(t - SEASON_START, YEAR) / SEASON)
export const seasonAt = (t: number, sky: Sky = {}): Season => sky.season ?? SEASONS[seasonIndexAt(t)]!
// Hours into the season at `t` (0 .. 96), from its first 4 a.m.
export const seasonHour = (t: number): number => (wrap(t - SEASON_START, SEASON) / DAY) * 24
// When the season under way at `t` ends.
export const seasonEnd = (t: number): number => t - wrap(t - SEASON_START, SEASON) + SEASON

// Each season's spells of weather, (from, to, what) in hours into the season; clear between them.
// (Hour 0 is 4 a.m. on its first day: hour 11 is 3 p.m.)
export const SPELLS: Readonly<Record<Season, readonly (readonly [number, number, Weather])[]>> = {
  spring: [[11, 15, 'rain'], [26.5, 29.5, 'rain'], [58, 61, 'rain'], [79, 82.5, 'rain']],
  summer: [
    [9, 10.5, 'rain'], [13, 14, 'rain'], [34, 35.5, 'rain'], [38.5, 39.5, 'rain'],
    [57, 58, 'rain'], [62, 63.5, 'rain'], [81, 82, 'rain'], [86, 87, 'rain'],
  ],
  autumn: [[16, 18.5, 'rain'], [66, 68, 'rain']],
  winter: [
    [6, 12, 'snow'], [12, 12.75, 'blizzard'], [12.75, 15, 'snow'], [30, 34, 'snow'],
    [52, 58, 'snow'], [58, 58.5, 'blizzard'], [58.5, 60, 'snow'], [78, 83, 'snow'],
  ],
}

// The weather at `t`.
export function weatherAt(t: number, sky: Sky = {}): Weather {
  if (sky.weather) return sky.weather
  const h = seasonHour(t)
  return SPELLS[seasonAt(t, sky)].find(([from, to]) => h >= from && h < to)?.[2] ?? 'clear'
}

// Weather that keeps people away from the park's seats and sends walkers under umbrellas or home:
// rain, and a blizzard. Light snow does not: people come out in it, dressed warm.
export const isWet = (w: Weather): boolean => w === 'rain' || w === 'blizzard'

// The times in [from, to) the weather may change: spell edges and season turns.
export function weatherChanges(from: number, to: number, sky: Sky = {}): number[] {
  if (sky.weather) return []
  const out: number[] = []
  for (let start = seasonEnd(from) - SEASON; start < to; start += SEASON) {
    const season = seasonAt(start + 1, sky)
    const edges = [0, ...SPELLS[season].flatMap(([a, b]) => [(a / 24) * DAY, (b / 24) * DAY])]
    for (const e of edges) {
      const t = start + e
      if (t >= from && t < to) out.push(t)
    }
  }
  return [...new Set(out)].sort((x, y) => x - y)
}

// How deep the snow lies, 0..1, `hour` hours into a winter: none at its start; it builds up while
// it snows (full in 3 hours, a blizzard three times as fast) and melts slowly between snowfalls
// (all gone in 16 hours), so it seldom melts away before the next.
export function snowDepthAt(hour: number): number {
  let depth = 0
  let at = 0
  const melt = (to: number): void => {
    depth = Math.max(0, depth - (to - at) / 16)
    at = to
  }
  for (const [from, to, w] of SPELLS.winter) {
    if (hour <= from) break
    melt(from)
    const end = Math.min(hour, to)
    depth = Math.min(1, depth + (end - at) * (w === 'blizzard' ? 1 : 1 / 3))
    at = end
  }
  if (hour > at) melt(hour)
  return depth
}

// The snow lying at `t`: only in winter, where a demo of snow lies thick at once; the last two
// hours of the winter it melts away for the spring.
export function snowDepth(t: number, sky: Sky = {}): number {
  if (seasonAt(t, sky) !== 'winter') return 0
  if (sky.weather === 'snow' || sky.weather === 'blizzard') return 1
  const depth = snowDepthAt(seasonHour(t))
  const left = seasonEnd(t) - t
  return sky.season || left >= DAY / 12 ? depth : depth * (left / (DAY / 12))
}
