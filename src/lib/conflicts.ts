import type { APPortfolio, ProjectRange } from './types'

export interface AssignmentConflict {
  /** Stable across renders; changes when the interval or its owners change. */
  key: string
  start: number
  /** null covers every supported project from start through MAX_SAFE_INTEGER. */
  end: number | null
  owners: { id: string; name: string }[]
}

interface Interval { start: number; end: number }
const MAX_PROJECT = Number.MAX_SAFE_INTEGER
const validProject = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Structural errors are handled by validateRules; never crash an in-progress editor draft. */
function usableRules(rules: APPortfolio[]): boolean {
  return Array.isArray(rules) && rules.every(rule => rule && typeof rule.id === 'string' && typeof rule.name === 'string'
    && Array.isArray(rule.ranges) && Array.isArray(rule.include) && Array.isArray(rule.exclude)
    && rule.include.every(validProject) && rule.exclude.every(validProject)
    && rule.ranges.every(range => range && validProject(range.start) && (range.end === null || (validProject(range.end) && range.end >= range.start))))
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = []
  for (const interval of intervals.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1)
    if (last && (interval.start <= last.end || (last.end < MAX_PROJECT && interval.start === last.end + 1))) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }
  return merged
}

/** An AP claims (its ranges minus its exclusions) union its explicit inclusions. */
function coverage(rule: APPortfolio): Interval[] {
  const ranges = mergeIntervals(rule.ranges.map(range => ({ start: range.start, end: range.end ?? MAX_PROJECT })))
  const excluded = [...new Set(rule.exclude)].sort((a, b) => a - b)
  const intervals: Interval[] = []
  let excludedIndex = 0
  for (const range of ranges) {
    let cursor = range.start
    let exhausted = false
    while (excludedIndex < excluded.length && excluded[excludedIndex] < range.start) excludedIndex++
    while (excludedIndex < excluded.length && excluded[excludedIndex] <= range.end) {
      const project = excluded[excludedIndex++]
      if (project > cursor) intervals.push({ start: cursor, end: project - 1 })
      // Avoid unsafe arithmetic at the supported project-number limit.
      if (project === range.end) { exhausted = true; break }
      cursor = project + 1
    }
    if (!exhausted && cursor <= range.end) intervals.push({ start: cursor, end: range.end })
  }
  return mergeIntervals([...intervals, ...rule.include.map(project => ({ start: project, end: project }))])
}

/**
 * Find every ambiguous ownership interval without enumerating its projects.
 * BigInt event coordinates let an inclusive MAX_SAFE_INTEGER endpoint close safely.
 */
export function findAssignmentConflicts(rules: APPortfolio[]): AssignmentConflict[] {
  if (!usableRules(rules)) return []
  const events = new Map<bigint, Map<string, number>>()
  const owners = new Map(rules.map(rule => [rule.id, { id: rule.id, name: rule.name.trim() }]))
  function event(point: bigint, id: string, delta: number) {
    const changes = events.get(point) ?? new Map<string, number>()
    changes.set(id, (changes.get(id) ?? 0) + delta)
    events.set(point, changes)
  }
  for (const rule of rules) for (const interval of coverage(rule)) {
    event(BigInt(interval.start), rule.id, 1)
    event(BigInt(interval.end) + 1n, rule.id, -1)
  }
  const points = [...events.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  const active = new Map<string, number>()
  const conflicts: AssignmentConflict[] = []
  for (let index = 0; index + 1 < points.length; index++) {
    const point = points[index]
    for (const [id, delta] of events.get(point)!) {
      const count = (active.get(id) ?? 0) + delta
      if (count > 0) active.set(id, count)
      else active.delete(id)
    }
    if (active.size < 2) continue
    const start = Number(point)
    const lastProject = Number(points[index + 1] - 1n)
    const end = lastProject === MAX_PROJECT ? null : lastProject
    const conflictOwners = [...active.keys()].sort().map(id => owners.get(id)!)
    const previous = conflicts.at(-1)
    const sameOwners = previous && previous.owners.length === conflictOwners.length && previous.owners.every((owner, ownerIndex) => owner.id === conflictOwners[ownerIndex].id)
    if (previous && previous.end !== null && previous.end < MAX_PROJECT && previous.end + 1 === start && sameOwners) {
      previous.end = end
      previous.key = JSON.stringify([previous.start, previous.end, previous.owners.map(owner => owner.id)])
    } else conflicts.push({ key: JSON.stringify([start, end, conflictOwners.map(owner => owner.id)]), start, end, owners: conflictOwners })
  }
  return conflicts
}

/** Resolve only the displayed interval; preserve every unrelated project assignment. */
export function resolveAssignmentConflict(rules: APPortfolio[], conflict: AssignmentConflict, ownerId: string): APPortfolio[] {
  const current = findAssignmentConflicts(rules).find(item => item.key === conflict.key)
  if (!current) throw new Error('This assignment conflict has changed. Review the current conflicts before choosing an owner.')
  if (!current.owners.some(owner => owner.id === ownerId)) throw new Error('Choose one of the AP clerks involved in this conflict.')
  const end = current.end ?? MAX_PROJECT
  const losingIds = new Set(current.owners.filter(owner => owner.id !== ownerId).map(owner => owner.id))
  return rules.map(rule => {
    const next = { ...rule, ranges: rule.ranges.map(range => ({ ...range })), include: [...rule.include], exclude: [...rule.exclude] }
    if (!losingIds.has(rule.id)) return next
    next.include = next.include.filter(project => project < current.start || project > end)
    next.ranges = next.ranges.flatMap((range): ProjectRange[] => {
      const rangeEnd = range.end ?? MAX_PROJECT
      if (rangeEnd < current.start || range.start > end) return [range]
      const pieces: ProjectRange[] = []
      if (range.start < current.start) pieces.push({ start: range.start, end: current.start - 1 })
      if (rangeEnd > end) pieces.push({ start: end + 1, end: range.end })
      return pieces
    })
    return next
  })
}
