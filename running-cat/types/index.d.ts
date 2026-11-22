declare module 'claude-code' {
  interface PluginState {
    'running-cat': {
      isResting: boolean
      restSince: number
      wokeAt: number | null
      wasNapping: boolean
      runMs: number
      runStartedAt: number | null
      finishAt: number | null
      wakeDone: number
      idleSince: number
      idleIntro: 'still' | 'stop' | 'cheer'
      idleTick: number
      freshTick: number
      demoSeason: 'spring' | 'summer' | 'autumn' | 'winter' | null
      demoWeather: 'clear' | 'rain' | 'snow' | 'blizzard' | null
    }
  }
}
