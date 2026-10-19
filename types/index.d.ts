/** Одна запись: момент и проценты лимитов в этот момент. */
export type Sample = {
  /** Время записи, мс (как $.clock.now()). */
  t: number
  /** Использовано из 5-часового окна, %. */
  five: number | null
  /** Использовано из недельного окна, %. */
  week: number | null
  /** Когда сбросится 5-часовое окно, ISO. */
  fiveReset: string | null
  /** Когда сбросится недельное окно, ISO. */
  weekReset: string | null
}

/** Что мод держит для рисования. */
export type Today = {
  /** День в формате ГГГГ-ММ-ДД. */
  day: string
  samples: Sample[]
  /** Ответов Claude за каждый час дня (24 ячейки). */
  turnsByHour: number[]
}

declare module 'claude-code' {
  interface PluginState {
    'limit-dnya': { today: Today | null }
  }
}
