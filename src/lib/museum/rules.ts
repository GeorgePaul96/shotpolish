// Museum of You rules for the client (pure). NOTE: the limits and price are
// duplicated in supabase/functions/_shared/museum.ts (separate bundles);
// rules.sync.test.ts keeps them equal.

export const FREE_EXHIBITS = 3
export const MAX_EXHIBITS = 20
export const FREE_DAYS = 7
export const PRICE_CENTS = 399
export const PRICE_LABEL = '$3.99'
export const LIMITS = { name: 40, title: 80, place: 60, year: 20, medium: 100 } as const

export type Tier = 'free' | 'full'

export interface DraftExhibit {
  id: string
  title: string
  place: string
  year: string
  medium: string
  photo: Blob | null
}

export interface MuseumDraft {
  recipientName: string
  curatorName: string
  exhibits: DraftExhibit[]
  finalPhoto: Blob | null
  updatedAt: number
}

export const emptyDraft = (): MuseumDraft => ({ recipientName: '', curatorName: '', exhibits: [], finalPhoto: null, updatedAt: Date.now() })

export const newExhibit = (id: string, photo: Blob | null): DraftExhibit => ({ id, title: '', place: '', year: '', medium: '', photo })

export const requiredTier = (exhibitCount: number): Tier => (exhibitCount > FREE_EXHIBITS ? 'full' : 'free')

/** Human-readable reasons the draft can't be published yet; empty when ready. */
export function draftProblems(d: MuseumDraft): string[] {
  const problems: string[] = []
  if (!d.recipientName.trim()) problems.push('Add the name of the person this museum is for.')
  if (d.exhibits.length === 0) problems.push('Add at least one exhibit.')
  if (d.exhibits.length > MAX_EXHIBITS) problems.push(`A museum can hold up to ${MAX_EXHIBITS} exhibits.`)
  d.exhibits.forEach((e, i) => {
    if (!e.photo) problems.push(`Exhibit ${i + 1} needs a photo.`)
    if (!e.title.trim()) problems.push(`Exhibit ${i + 1} needs a title.`)
  })
  return problems
}

/** Whole days until expiry, rounded up; 0 once closed; null means open forever. */
export function daysLeft(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000))
}

export const MEDIUM_SUGGESTIONS = [
  'bad decisions, one shared umbrella',
  'flour, a smoke alarm, optimism',
  'two aux cords, zero compromise',
  'one borrowed jacket, perfect timing',
  'cold coffee and a very long walk',
  'inside jokes nobody else gets',
  'a wrong turn that turned out right',
  'sunscreen, sand, no regrets',
]

export function nextMedium(current: string): string {
  const i = MEDIUM_SUGGESTIONS.indexOf(current)
  return MEDIUM_SUGGESTIONS[(i + 1) % MEDIUM_SUGGESTIONS.length]
}
