import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Sample, Today } from '../types'

// «Лимит дня»: сколько лимита подписки Claude потрачено за 5 часов и за неделю,
// и графики расхода за сегодня. Цифры дает сам Claude Code (те же, что в настройках
// лимитов), мод их запоминает по ходу дня в своем хранилище.

const PANE = 'limit-dnya'
const today = atom({ plugin: 'limit-dnya', key: 'today' } as const, null)

// Стиль: серая «бумага» с зерном, черный жирный шрифт, горчичный акцент,
// рукописные подписи и солнце-каракуля.
const C = {
  paper: '#D7D6D2',
  ink: '#141414',
  yellow: '#E2AC1F',
  yellowDeep: '#C08D10',
  grey: '#6E6E6A',
  pink: '#E2AC1F',
  pinkSoft: '#C08D10',
}
const HAND = "'Marker Felt', 'Bradley Hand', 'Chalkboard SE', cursive"
const BOLD = "'Montserrat', 'Helvetica Neue', Arial, sans-serif"

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const hourOf = (t: number) => new Date(t).getHours()
const timeOf = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const pick = (limits: SessionRateLimit[], kind: string) => limits.find(l => l.kind === kind)

const empty = (day: string): Today => ({ day, samples: [], turnsByHour: Array(24).fill(0) })

/** Расход за каждый час: на сколько процентных пунктов вырос недельный лимит. */
const spendByHour = (samples: Sample[]) => {
  const out = Array(24).fill(0) as number[]
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]
    const cur = samples[i]
    if (!prev || !cur || prev.week === null || cur.week === null) continue
    const d = cur.week - prev.week
    const h = hourOf(cur.t)
    if (d > 0) out[h] = (out[h] ?? 0) + d
  }
  return out.map(v => Math.round(v * 10) / 10)
}

// ---------- SVG ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const ring = (cx: number, cy: number, r: number, pct: number, color: string, title: string, sub: string) => {
  const len = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct))
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(20,20,20,0.12)" stroke-width="18"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"
    stroke-dasharray="${(len * p) / 100} ${len}" transform="rotate(-90 ${cx} ${cy})" filter="url(#rough)"/>
  <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="${BOLD}" font-size="38" font-weight="900" fill="${C.ink}">${Math.round(p)}%</text>
  <text x="${cx}" y="${cy + r + 40}" text-anchor="middle" font-family="${BOLD}" font-size="18" font-weight="900" fill="${C.ink}" letter-spacing="1">${esc(title)}</text>
  <text x="${cx}" y="${cy + r + 64}" text-anchor="middle" font-family="${HAND}" font-size="17" fill="${C.grey}">${esc(sub)}</text>`
}

/** Солнце-каракуля из лучей. */
const sun = (cx: number, cy: number) =>
  Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2
    const r1 = 10
    const r2 = 34 + (i % 3) * 6
    return `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}" stroke="${C.yellow}" stroke-width="4" stroke-linecap="round"/>`
  }).join('')

/** Мазок кистью под текстом, как «≠» на референсе. */
const brush = (x: number, y: number, w: number) =>
  `<path d="M${x} ${y} q ${w * 0.25} -9 ${w * 0.5} -2 t ${w * 0.5} -3" fill="none" stroke="${C.yellow}" stroke-width="16" stroke-linecap="round" opacity="0.9" filter="url(#rough)"/>`

const chart = (t: Today) => {
  const W = 640
  const last = t.samples[t.samples.length - 1]
  const five = last?.five ?? 0
  const week = last?.week ?? 0
  const spend = spendByHour(t.samples)
  const spentToday = Math.round(spend.reduce((a, b) => a + b, 0) * 10) / 10
  const maxSpend = Math.max(1, ...spend)
  const maxTurns = Math.max(1, ...t.turnsByHour)

  const bx = 40
  const bw = (W - 80) / 24
  const by = 760
  const bh = 150
  const bars = spend
    .map((v, h) => {
      const hgt = (v / maxSpend) * bh
      const turns = t.turnsByHour[h] ?? 0
      const dot = turns
        ? `<circle cx="${bx + h * bw + bw / 2}" cy="${by - (turns / maxTurns) * bh}" r="4.5" fill="${C.ink}"/>`
        : ''
      return `<rect x="${bx + h * bw + 2}" y="${by - hgt}" width="${bw - 4}" height="${Math.max(hgt, v > 0 ? 3 : 0)}" fill="${C.yellow}" stroke="${C.ink}" stroke-width="1.5"/>${dot}`
    })
    .join('')
  const first = t.samples[0]
  const since = first ? `${pad(new Date(first.t).getHours())}:${pad(new Date(first.t).getMinutes())}` : ''
  const quiet = spentToday === 0
    ? `<text x="${W / 2}" y="${by - 60}" text-anchor="middle" font-family="${HAND}" font-size="19" fill="${C.grey}">столбики вырастут, когда недельный лимит сдвинется на 1%</text>
       <text x="${W / 2}" y="${by - 34}" text-anchor="middle" font-family="${HAND}" font-size="16" fill="${C.grey}">запись идет с ${since}</text>`
    : ''
  const hours = [0, 6, 12, 18, 23]
    .map(h => `<text x="${bx + h * bw + bw / 2}" y="${by + 24}" text-anchor="middle" font-family="${HAND}" font-size="15" fill="${C.grey}">${pad(h)}:00</text>`)
    .join('')

  const day0 = new Date(t.samples[0]?.t ?? 0)
  day0.setHours(0, 0, 0, 0)
  const pts = t.samples
    .filter(s => s.five !== null)
    .map(s => {
      const x = bx + ((s.t - day0.getTime()) / 86400000) * (W - 80)
      const y = 1010 - ((s.five as number) / 100) * 140
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
  const line = pts.length > 1
    ? `<polyline points="${bx},1010 ${pts.join(' ')} ${(pts[pts.length - 1] ?? '').split(',')[0]},1010" fill="${C.yellow}" opacity="0.45" stroke="none"/>
       <polyline points="${pts.join(' ')}" fill="none" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#rough)"/>`
    : `<text x="${W / 2}" y="950" text-anchor="middle" font-family="${HAND}" font-size="18" fill="${C.grey}">линия появится после нескольких ответов Claude</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 1080">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0"/>
    </filter>
    <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>
    <path id="arc" d="M 130 262 A 200 92 0 0 1 510 262"/>
  </defs>
  <rect width="${W}" height="1080" rx="24" fill="${C.paper}"/>
  <rect width="${W}" height="1080" rx="24" filter="url(#grain)"/>
  ${sun(70, 70)}
  <text font-family="${HAND}" font-size="22" fill="${C.ink}"><textPath href="#arc" startOffset="50%" text-anchor="middle">сколько Claude съел сегодня</textPath></text>
  ${brush(150, 122, 215)}
  <text x="150" y="112" font-family="${BOLD}" font-size="54" font-weight="900" fill="${C.ink}" letter-spacing="1">ЛИМИТ</text>
  <text x="388" y="114" font-family="${HAND}" font-size="52" fill="${C.ink}" transform="rotate(-5 388 114)">дня</text>
  ${ring(170, 350, 70, five, C.yellow, 'ЗА 5 ЧАСОВ', `сброс ${timeOf(last?.fiveReset ?? null)}`)}
  ${ring(470, 350, 70, week, C.yellowDeep, 'ЗА НЕДЕЛЮ', `сброс ${timeOf(last?.weekReset ?? null)}`)}
  ${brush(150, 548, 340)}
  <text x="${W / 2}" y="550" text-anchor="middle" font-family="${BOLD}" font-size="22" font-weight="900" fill="${C.ink}">СЕГОДНЯ +${spentToday}% НЕДЕЛИ</text>
  <text x="40" y="${by - bh - 14}" font-family="${BOLD}" font-size="16" font-weight="900" fill="${C.ink}" letter-spacing="0.5">РАСХОД ПО ЧАСАМ</text>
  <text x="${W - 40}" y="${by - bh - 14}" text-anchor="end" font-family="${HAND}" font-size="16" fill="${C.ink}">● ответы Claude</text>
  <line x1="${bx}" y1="${by}" x2="${W - 40}" y2="${by}" stroke="${C.ink}" stroke-width="2"/>
  ${bars}${hours}${quiet}
  <text x="40" y="840" font-family="${BOLD}" font-size="16" font-weight="900" fill="${C.ink}" letter-spacing="0.5">5-ЧАСОВОЕ ОКНО ЗА ДЕНЬ</text>
  <line x1="${bx}" y1="868" x2="${W - 40}" y2="868" stroke="${C.grey}" stroke-dasharray="3 7"/>
  <text x="${W - 40}" y="862" text-anchor="end" font-family="${HAND}" font-size="14" fill="${C.grey}">100%</text>
  <line x1="${bx}" y1="1010" x2="${W - 40}" y2="1010" stroke="${C.ink}" stroke-width="2"/>
  ${line}
  <text x="40" y="1054" font-family="${HAND}" font-size="15" fill="${C.grey}">данные Claude Code · обновлено ${timeOf(last ? new Date(last.t).toISOString() : null)} · без бла-бла</text>
</svg>`
}

/** Текстовая шкала для терминала: ██████░░░░ */
const bar = (pct: number, width = 20) => {
  const n = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

async function record($: EngineInterface, limits: SessionRateLimit[]) {
  const now = await $.clock.now()
  const day = dayOf(now)
  const five = pick(limits, 'five_hour')
  const week = pick(limits, 'seven_day')
  if (!five && !week) return
  const sample: Sample = {
    t: now,
    five: five?.percentUsed ?? null,
    week: week?.percentUsed ?? null,
    fiveReset: five?.resetsAt ?? null,
    weekReset: week?.resetsAt ?? null,
  }
  let saved = (await $.store.get(`day-${day}`)) as Today | undefined
  if (!saved || saved.day !== day) saved = empty(day)
  const next: Today = { ...saved, samples: [...saved.samples, sample].slice(-2000) }
  await $.store.set(`day-${day}`, next)
  await update($, today, () => next)
  $.ui.status(`Лимит: 5 ч ${Math.round(sample.five ?? 0)}% · неделя ${Math.round(sample.week ?? 0)}%`)
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limit', description: 'Лимит дня: расход лимита Claude с графиками' })
    const day = dayOf(await $.clock.now())
    const saved = (await $.store.get(`day-${day}`)) as Today | undefined
    await update($, today, () => saved ?? empty(day))
    const usage = await $.session.usage()
    if (usage.rateLimits.length) await record($, usage.rateLimits)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await record($, e.rateLimits)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const day = dayOf(now)
    let saved = (await $.store.get(`day-${day}`)) as Today | undefined
    if (!saved || saved.day !== day) saved = empty(day)
    const turns = [...saved.turnsByHour]
    const h = hourOf(now)
    turns[h] = (turns[h] ?? 0) + 1
    const fresh: Today = { ...saved, turnsByHour: turns }
    await $.store.set(`day-${day}`, fresh)
    await update($, today, () => fresh)
    const usage = await $.session.usage()
    if (usage.rateLimits.length) await record($, usage.rateLimits)
    return next(e)
  })

  on('command.run', { command: 'limit' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Лимит дня' })
    if (isPlaced) return { text: 'Открыла панель «Лимит дня».' }
    const t = await read($, today)
    const last = t?.samples[t.samples.length - 1]
    if (!last) return { text: 'Данных о лимитах пока нет: они появятся после первого ответа Claude.' }
    return {
      text: `5 часов: ${bar(last.five ?? 0)} ${Math.round(last.five ?? 0)}% (сброс ${timeOf(last.fiveReset)})\nНеделя:  ${bar(last.week ?? 0)} ${Math.round(last.week ?? 0)}% (сброс ${timeOf(last.weekReset)})`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const t = await read($, today)
    const last = t?.samples[t.samples.length - 1]

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      if (!t || !last) return <Text dimColor>Данных о лимитах пока нет: они появятся после первого ответа Claude.</Text>
      const spend = spendByHour(t.samples)
      const max = Math.max(1, ...spend)
      const spark = spend.map(v => (v === 0 ? '·' : '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / max) * 7.99))])).join('')
      return (
        <Box flexDirection="column">
          <Text bold color={C.pink}>ЛИМИТ ДНЯ</Text>
          <Text>5 часов  <Text color={C.pink}>{bar(last.five ?? 0)}</Text> {Math.round(last.five ?? 0)}%  сброс {timeOf(last.fiveReset)}</Text>
          <Text>Неделя   <Text color={C.pinkSoft}>{bar(last.week ?? 0)}</Text> {Math.round(last.week ?? 0)}%  сброс {timeOf(last.weekReset)}</Text>
          <Text dimColor>По часам 00→23</Text>
          <Text color={C.pink}>{spark}</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    if (!t || !last) {
      return (
        <Box flexDirection="column">
          <Text>Данных о лимитах пока нет: они появятся после первого ответа Claude.</Text>
        </Box>
      )
    }
    return (
      <Svg
        source={chart(t)}
        alt={`Лимит Claude: за 5 часов ${Math.round(last.five ?? 0)}%, за неделю ${Math.round(last.week ?? 0)}%`}
        width={640}
        isInteractive={false}
      />
    )
  })
}
