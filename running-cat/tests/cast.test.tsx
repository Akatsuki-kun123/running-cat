import { expect, test } from 'claude-code/testing'

import { Park, Person, Place, SitOnBench, Spot, draw, isRainingAt, makePark } from '../hooks/cast'
import { YEAR, seasonIndexAt, weatherAt } from '../hooks/season'

test('a draw is the same for the same keys, and spread for others', () => {
  expect(draw('red', 3, 'pick')).toBe(draw('red', 3, 'pick'))
  const many = Array.from({ length: 200 }, (_, i) => draw('x', i))
  expect(Math.min(...many)).toBeLessThan(0.1)
  expect(Math.max(...many)).toBeGreaterThan(0.9)
})

test('people pick different things on different visits', () => {
  const plan = makePark().plan()
  for (const id of ['coat', 'red', 'bun', 'pink', 'satchel', 'hoodie']) {
    const did = new Set(plan.filter(b => b.person.id === id).map(b => b.action.id))
    expect(did.size).toBeGreaterThan(1)
  }
})

test('everyone only does what they like, and only where the park can draw them', { timeoutMs: 30_000 }, () => {
  for (const b of makePark().plan()) {
    expect(b.person.does).toContain(b.action.id)
    expect(b.spot.people).toContain(b.person.index)
    expect(b.action.places).toContain(b.place)
    expect(b.place.spots).toContain(b.spot)
  }
})

test('a spot has one person a beat, and says so', () => {
  const spot = new Spot(0, 180, [0])
  const a = new Person('a', 0, null, ['bench'])
  spot.hold(3, a)
  expect(spot.isFree(3)).toBe(false)
  expect(spot.isFree(3 + spot.beats)).toBe(false)     // the same beat, a cycle on
  expect(spot.isFree(4)).toBe(true)
  expect(() => spot.hold(3, a)).toThrow()
})

test('a bench seats two: a third who comes with them waits for a later visit', () => {
  const bench = new Place('bench', [new Spot(0, 180, [0, 1, 2]), new Spot(6, 180, [0, 1, 2])])
  const people = ['a', 'b', 'c'].map((id, i) => new Person(id, i, null, ['bench'], 0))
  const plan = new Park(people, [new SitOnBench([bench])], () => false).plan()
  const first = plan.filter(b => b.person.id !== 'c' && b.from === Math.min(...plan.filter(p => p.person.id === b.person.id).map(p => p.from)))
  const c = plan.filter(b => b.person.id === 'c')[0]!
  // the first two take both places: two seats, or the same seat on the two copies a period has
  expect(new Set(first.map(b => `${b.spot.stage}:${b.beat}`)).size).toBe(2)
  expect(c.from).toBeGreaterThan(Math.min(...first.map(b => b.from)))
  expect(bench.capacity).toBe(2)
})

test('nobody comes to the park in the rain or a blizzard, not even to the toilet: the walk from the gate is open', () => {
  for (const b of makePark().plan()) {
    for (let t = b.from; t <= b.to; t += 1) expect([b.place.id, isRainingAt(t)]).toEqual([b.place.id, false])
  }
})

test('people come out in light snow, but no visit runs over the turn of a season', () => {
  const plan = makePark().plan()
  expect(plan.some(b => weatherAt(b.mid) === 'snow')).toBe(true)
  for (const b of plan) expect([b.from, seasonIndexAt(b.from)]).toEqual([b.from, seasonIndexAt(b.to)])
  // and the plan covers the whole year
  expect(Math.max(...plan.map(b => b.to))).toBeGreaterThan(YEAR - 600)
})

test('nobody stops in two places at once', () => {
  const plan = makePark().plan()
  for (const id of new Set(plan.map(b => b.person.id))) {
    const mine = plan.filter(b => b.person.id === id).sort((x, y) => x.from - y.from)
    // a stop is under 40 s about the middle of a visit; the next sets off only after the middle
    for (let n = 1; n < mine.length; n++) {
      const [was, now] = [mine[n - 1]!, mine[n]!]
      expect(now.from).toBeGreaterThanOrEqual(was.mid)
      expect(now.mid - was.mid).toBeGreaterThan(40)
    }
  }
})

test('every cycle and every fresh park plans the same', () => {
  const a = makePark()
  const b = makePark()
  for (const spot of a.spots) {
    const { stage, beats } = spot
    for (let beat = 0; beat < 40; beat++) {
      expect(a.variantAt(stage, beat)).toBe(b.variantAt(stage, beat))
      expect(a.variantAt(stage, beat + 3 * beats)).toBe(a.variantAt(stage, beat))
    }
  }
})

test('the park is neither empty nor always full', () => {
  const park = makePark()
  park.plan()
  let seen = 0
  let all = 0
  for (const spot of park.spots) {
    for (let beat = 0; beat < spot.beats; beat++, all++) if (spot.who(beat)) seen++
  }
  // (two beats a period, each on its own copy: half the copies of a stage stand empty at most)
  expect(seen / all).toBeGreaterThan(0.2)
  expect(seen / all).toBeLessThan(0.95)
})
