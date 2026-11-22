// The park's cast as objects: people who come to the park, places with a few spots each, and the
// things to do there. Each time someone comes they pick something to do, at random, from their own
// short list of what they like doing, among what is free: a bench seats two (its side seat and its
// front seat), a drink machine one buyer, the toilet one.
//
// A spot is one of the park's stages: someone comes out of the gate to it, stays, and goes back in at the gate,
// over and over on its own beat (`period` seconds, from `visitOffset`). The drawing has everyone who
// can use a stage there and shows one of them; this plan says who, beat by beat.
//
// The band is redrawn now and then and must find everyone where they were, so "random" here is a
// seeded draw: the same person on the same coming always makes the same pick. The park's year
// (YEAR seconds: four seasons, each with its own weather) is planned whole, from its start, so
// every year plans the same and a redraw at any moment reads the same plan.

import { DAY, VISITORS } from './park'
import { YEAR, isWet, seasonIndexAt, weatherAt } from './season'

// ---------- seeded draws ----------

// A number in [0, 1) for these keys, the same every time: FNV-1a into mulberry32.
export function draw(...keys: (string | number)[]): number {
  let h = 2166136261
  for (const ch of keys.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  let t = (h + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------- the clock ----------

const wrap = (x: number, m: number): number => ((x % m) + m) % m

// The spans of the day someone is out, each (from, to) in hours; null for all day and night.
export type Hours = readonly (readonly [number, number])[] | null

const hourAt = (t: number): number => (wrap(t, DAY) / DAY) * 24

export const isOutAt = (hours: Hours, t: number): boolean =>
  hours === null || hours.some(([from, to]) => (from < to ? hourAt(t) >= from && hourAt(t) < to : hourAt(t) >= from || hourAt(t) < to))

// Whether it is wet at `t` seconds (rain, or a blizzard): the season's own spells of weather.
export const isRainingAt = (t: number): boolean => isWet(weatherAt(t))

// Each stage's visits start at their own point in its beat, so they do not all come at once.
export const visitOffset = (i: number, period: number): number => (i * 41) % period

// ---------- spots and places ----------

// One stage of the park: its beats, and who has each. Beat b is one visit (out of the gate, a
// stay, back in), centred on mid(b); two beats a period, on every other copy of the park's tile
// in turn (the two never in view at once), so a spot is never shared within a copy.
export class Spot {
  private readonly taken = new Map<number, Person>()

  constructor(
    readonly stage: number,
    readonly period: number,
    readonly people: readonly number[],    // who the drawing has here: variant n + 1 is people[n]
    readonly shown: readonly [number, number] = [0, period],   // a visit in view: s into its period
  ) {}

  get beats(): number {
    return Math.round((2 * YEAR) / this.period)
  }

  mid(b: number): number {
    return this.period * Math.floor(b / 2) + this.period / 2 - visitOffset(this.stage, this.period)
  }

  // The first beat whose visit starts at `t` or later.
  beatFrom(t: number): number {
    return 2 * Math.ceil((t + visitOffset(this.stage, this.period)) / this.period)
  }

  canSeat(person: Person): boolean {
    return this.people.includes(person.index)
  }

  isFree(b: number): boolean {
    return !this.taken.has(wrap(b, this.beats))
  }

  hold(b: number, person: Person): void {
    if (!this.isFree(b)) throw new Error(`stage ${this.stage}: beat ${b} is taken`)
    this.taken.set(wrap(b, this.beats), person)
  }

  // Who has beat b (any cycle), or null.
  who(b: number): Person | null {
    return this.taken.get(wrap(b, this.beats)) ?? null
  }

  clear(): void {
    this.taken.clear()
  }
}

// Somewhere in the park with a few spots.
export class Place {
  constructor(
    readonly id: string,
    readonly spots: readonly Spot[],
    readonly isSheltered = false,          // under a roof: fine in the rain
  ) {}

  get capacity(): number {
    return this.spots.length
  }
}

// ---------- actions ----------

// Something to do in the park: where it is done and how likely a pick it is.
export abstract class Action {
  constructor(
    readonly id: string,
    readonly places: readonly Place[],
    readonly weight = 1,
  ) {}

  // Whether this person would do it at all: it is on their list.
  canDo(person: Person): boolean {
    return person.does.includes(this.id)
  }

  // Whether it can only be done when it is dry.
  isDryOnly(place: Place): boolean {
    return !place.isSheltered
  }
}

export class SitOnBench extends Action {
  constructor(benches: readonly Place[]) {
    super('bench', benches, 3)
  }
}

export class BuyDrink extends Action {
  constructor(machines: readonly Place[]) {
    super('drink', machines, 2)
  }
}

export class TakePhoto extends Action {
  constructor(tree: Place) {
    super('photo', [tree], 2)
  }
}

export class ReadPhone extends Action {
  constructor(lamps: readonly Place[]) {
    super('read', lamps, 2)
  }
}

// Two who meet and talk a while, then part: the pair is one of the park's people to the plan.
export class Talk extends Action {
  constructor(spot: Place) {
    super('talk', [spot], 2)
  }
}

export class UseToilet extends Action {
  constructor(toilet: Place) {
    super('toilet', [toilet], 1)
  }
}

// ---------- people ----------

// Someone who comes to the park now and then: their index in the park's art, when they are out,
// what they like doing there, and how long they wait before coming again (up to `rest` s).
export class Person {
  constructor(
    readonly id: string,
    readonly index: number,
    readonly hours: Hours,
    readonly does: readonly string[],
    readonly rest = 20,
  ) {}
}

// ---------- the plan ----------

// One visit: who, doing what, where, on which beat, and the span of it.
export type Booking = {
  person: Person
  action: Action
  place: Place
  spot: Spot
  beat: number
  from: number     // out of the gate
  mid: number      // the middle of the stop
  to: number       // back in at the gate
}

export class Park {
  private planned: Booking[] | null = null

  constructor(
    readonly people: readonly Person[],
    readonly actions: readonly Action[],
    readonly isRaining: (t: number) => boolean = isRainingAt,
  ) {}

  get spots(): Spot[] {
    return [...new Set(this.actions.flatMap(a => a.places.flatMap(p => p.spots)))]
  }

  // Everyone's visits in one year, from its start. Comings are taken in time order, so
  // whoever comes first gets the seat; each picks at random among the things they like that have
  // a spot free soon, dry for the whole visit; with nothing free they try again a minute later.
  plan(): Booking[] {
    if (this.planned) return this.planned
    this.spots.forEach(s => s.clear())
    const next = new Map(this.people.map(p => [p, draw(p.id, 'start') * p.rest]))
    const comings = new Map(this.people.map(p => [p, 0]))
    const plan: Booking[] = []
    for (;;) {
      let person: Person | null = null
      for (const [p, t] of next) if (t < YEAR && (person === null || t < next.get(person)!)) person = p
      if (person === null) break
      const t = next.get(person)!
      const visit = comings.get(person)!
      comings.set(person, visit + 1)
      const options = this.options(person, t)
      if (!options.length) {
        next.set(person, t + 60)
        continue
      }
      const total = options.reduce((sum, o) => sum + o.action.weight, 0)
      let pick = draw(person.id, visit, 'pick') * total
      const chosen = options.find(o => (pick -= o.action.weight) < 0) ?? options[options.length - 1]!
      chosen.spot.hold(chosen.beat, person)
      plan.push(chosen)
      // they come again once this visit is over, and has been a while
      next.set(person, chosen.to + draw(person.id, visit, 'rest') * person.rest)
    }
    this.planned = plan
    return plan
  }

  // What this person could do coming at `t`: each thing they like, at the spot of it they can be
  // drawn at with the soonest free beat, if that is dry (when it has to be), in their hours, all in
  // one season (they come dressed for it) and over before the year ends.
  private options(person: Person, t: number): Booking[] {
    const out: Booking[] = []
    for (const action of this.actions) {
      if (!action.canDo(person)) continue
      let best: Booking | null = null
      for (const place of action.places) {
        for (const spot of place.spots) {
          if (!spot.canSeat(person)) continue
          for (let beat = spot.beatFrom(t - spot.shown[0]); ; beat++) {
            const start = spot.mid(beat) - spot.period / 2
            const from = start + spot.shown[0]
            const to = start + spot.shown[1]
            if (from > t + spot.period || to > YEAR) break
            if (!spot.isFree(beat)) continue
            if (seasonIndexAt(from) !== seasonIndexAt(to)) continue
            if (!isOutAt(person.hours, spot.mid(beat))) break
            if (action.isDryOnly(place) && this.rainsDuring(from, to)) break
            if (!best || from < best.from) best = { person, action, place, spot, beat, from, mid: spot.mid(beat), to }
            break
          }
        }
      }
      if (best) out.push(best)
    }
    return out
  }

  private rainsDuring(from: number, to: number): boolean {
    for (let t = from; t < to; t += 5) if (this.isRaining(t)) return true
    return this.isRaining(to)
  }

  // Who comes on beat b of a stage, as its variant number (1 for people[0], ...), or 0: nobody.
  variantAt(stage: number, b: number): number {
    this.plan()
    const spot = this.spots.find(s => s.stage === stage)
    const who = spot?.who(b)
    return spot && who ? spot.people.indexOf(who.index) + 1 : 0
  }
}

// ---------- this park ----------

// The places as the park's art draws them, each spot one of its stages (VISITORS in park.ts).
export function makePark(isRaining: (t: number) => boolean = isRainingAt): Park {
  const spot = (i: number): Spot => {
    const v = VISITORS[i]!
    return new Spot(v.i, v.period, v.people, v.shown)
  }
  const benches = [new Place('bench1', [spot(0), spot(6)]), new Place('bench2', [spot(1), spot(7)])]
  const actions: Action[] = [
    new SitOnBench(benches),
    new BuyDrink([new Place('machine', [spot(2)])]),
    new TakePhoto(new Place('cherry', [spot(3)])),
    new ReadPhone([new Place('lamp', [spot(4)])]),
    // (not sheltered: the walk to it from the gate and back is out in the open)
    new UseToilet(new Place('toilet', [spot(5)])),
    new Talk(new Place('talk', [spot(8)])),
  ]
  const people = [
    new Person('coat', 0, [[8, 21]], ['bench', 'read']),
    new Person('tee', 1, [[9, 20]], ['bench', 'photo']),
    new Person('red', 2, null, ['drink', 'bench', 'photo']),
    new Person('bun', 3, [[8, 23]], ['photo', 'bench', 'read', 'toilet']),
    new Person('pink', 4, null, ['read', 'photo', 'toilet']),
    new Person('satchel', 5, [[8, 17], [18, 20]], ['toilet', 'read', 'bench']),
    new Person('cap', 6, null, ['bench', 'read']),
    new Person('hoodie', 7, [[8, 17], [18, 22]], ['bench', 'toilet', 'read']),
    // the talking pairs
    new Person('pair0', 8, [[9, 22]], ['talk'], 30),
    new Person('pair1', 9, [[10, 20]], ['talk'], 30),
  ]
  return new Park(people, actions, isRaining)
}
