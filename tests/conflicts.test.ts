import { describe, expect, test } from 'vitest'
import { findAssignmentConflicts, resolveAssignmentConflict } from '../src/lib/conflicts'
import { compileRules, validateRules } from '../src/lib/analysis'
import { freshDefaultRules } from '../src/lib/default-rules'
import type { APPortfolio } from '../src/lib/types'

const rule = (id: string, start: number, end: number | null): APPortfolio => ({ id, name: id, ranges: [{ start, end }], include: [], exclude: [] })
const claims = (rules: APPortfolio[], project: number): string[] => rules.filter(item => item.include.includes(project) || (item.ranges.some(range => project >= range.start && (range.end === null || project <= range.end)) && !item.exclude.includes(project))).map(item => item.id).sort()

describe('complete ownership conflict detection', () => {
  test('original portfolios have no ambiguous projects', () => {
    expect(findAssignmentConflicts(freshDefaultRules())).toEqual([])
    expect(validateRules(freshDefaultRules())).toEqual([])
  })

  test('explicit assignments versus ranges require a choice, even when includes previously won', () => {
    const rules = [rule('A', 5000, 6000), { ...rule('B', 7000, null), include: [5419] }]
    expect(findAssignmentConflicts(rules).map(({ start, end, owners }) => ({ start, end, owners }))).toEqual([
      { start: 5419, end: 5419, owners: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }] },
    ])
    expect(() => compileRules(rules)).toThrow()
  })

  test('reports every owner and groups only adjacent projects with identical owners', () => {
    const rules = [rule('A', 1, 20), { ...rule('B', 4, 15), exclude: [8] }, rule('C', 10, 12)]
    const groups = findAssignmentConflicts(rules)
    expect(groups.map(({ start, end, owners }) => [start, end, owners.map(owner => owner.id)])).toEqual([
      [4, 7, ['A', 'B']], [9, 9, ['A', 'B']], [10, 12, ['A', 'B', 'C']], [13, 15, ['A', 'B']],
    ])
    for (let project = 0; project <= 25; project++) {
      const owners = claims(rules, project)
      const matching = groups.filter(group => project >= group.start && (group.end === null || project <= group.end))
      expect(matching.length).toBe(owners.length > 1 ? 1 : 0)
      if (matching.length) expect(matching[0].owners.map(owner => owner.id)).toEqual(owners)
    }
  })

  test('same-owner overlapping ranges and repeated include IDs do not create duplicate ownership', () => {
    const rules = [{ ...rule('A', 1, 20), ranges: [{ start: 1, end: 20 }, { start: 5, end: 10 }], include: [5, 5, 30] }, rule('B', 40, 50)]
    expect(findAssignmentConflicts(rules)).toEqual([])
    expect(validateRules(rules)).toEqual([])
  })

  test('unbounded and maximum-safe boundaries are handled without enumerating projects', () => {
    const max = Number.MAX_SAFE_INTEGER
    const groups = findAssignmentConflicts([rule('A', 0, null), rule('B', 5791, null), { ...rule('C', max, max), include: [max] }])
    expect(groups.map(({ start, end, owners }) => [start, end, owners.map(owner => owner.id)])).toEqual([
      [5791, max - 1, ['A', 'B']], [max, null, ['A', 'B', 'C']],
    ])
    expect(findAssignmentConflicts([{ ...rule('A', max, null), exclude: [max] }, rule('B', max, null)])).toEqual([])
  })

  test('malformed unfinished drafts do not crash conflict discovery', () => {
    expect(findAssignmentConflicts([{ ...rule('A', 1, 4), ranges: [{ start: 3, end: 2 }] }])).toEqual([])
    expect(findAssignmentConflicts([null] as unknown as APPortfolio[])).toEqual([])
  })
})

describe('explicit owner choice', () => {
  test('retains the chosen owner and every unrelated assignment without mutating the draft', () => {
    const rules = [rule('A', 1, 10), { ...rule('B', 5, 8), include: [2] }, rule('C', 15, 20)]
    const snapshot = structuredClone(rules)
    let next = rules
    const decisions = new Map<number, string>()
    while (findAssignmentConflicts(next).length) {
      const conflict = findAssignmentConflicts(next)[0]
      const ownerId = conflict.start === 2 ? 'B' : 'A'
      for (let project = conflict.start; project <= conflict.end!; project++) decisions.set(project, ownerId)
      next = resolveAssignmentConflict(next, conflict, ownerId)
    }
    expect(rules).toEqual(snapshot)
    expect(validateRules(next)).toEqual([])
    const assign = compileRules(next)
    for (let project = 0; project <= 25; project++) {
      expect(assign(project)?.id ?? null).toBe(decisions.get(project) ?? claims(snapshot, project)[0] ?? null)
    }
    expect(assign(12)).toBeNull()
    expect(next[1].include).toContain(2)
    expect(next[1].ranges).toEqual([])
  })

  test('removes a single explicit claim when a range owner is selected', () => {
    const rules = [rule('A', 5000, 6000), { ...rule('B', 7000, null), include: [5419, 6500] }]
    const next = resolveAssignmentConflict(rules, findAssignmentConflicts(rules)[0], 'A')
    expect(next[1].include).toEqual([6500])
    expect(compileRules(next)(5419)?.id).toBe('A')
    expect(compileRules(next)(6500)?.id).toBe('B')
  })

  test('splits losing ranges around a chosen middle interval', () => {
    const rules = [rule('A', 1, 100), rule('B', 20, 30)]
    const next = resolveAssignmentConflict(rules, findAssignmentConflicts(rules)[0], 'B')
    expect(next[0].ranges).toEqual([{ start: 1, end: 19 }, { start: 31, end: 100 }])
    expect(findAssignmentConflicts(next)).toEqual([])
  })

  test('resolves unlimited ranges and the MAX_SAFE_INTEGER endpoint exactly', () => {
    const max = Number.MAX_SAFE_INTEGER
    let next = [rule('A', 0, null), rule('B', max, null)]
    next = resolveAssignmentConflict(next, findAssignmentConflicts(next)[0], 'B')
    expect(next[0].ranges).toEqual([{ start: 0, end: max - 1 }])
    expect(compileRules(next)(max)?.id).toBe('B')
    expect(compileRules(next)(max - 1)?.id).toBe('A')
    const unlimited = [rule('A', 0, null), rule('B', 5000, null)]
    const resolved = resolveAssignmentConflict(unlimited, findAssignmentConflicts(unlimited)[0], 'B')
    expect(resolved[0].ranges).toEqual([{ start: 0, end: 4999 }])
    expect(compileRules(resolved)(max)?.id).toBe('B')
  })

  test('rejects stale conflicts and unrelated AP choices', () => {
    const rules = [rule('A', 1, 10), rule('B', 5, 12)]
    const conflict = findAssignmentConflicts(rules)[0]
    expect(() => resolveAssignmentConflict(rules, conflict, 'other')).toThrow('involved')
    const resolved = resolveAssignmentConflict(rules, conflict, 'A')
    expect(() => resolveAssignmentConflict(resolved, conflict, 'A')).toThrow('changed')
  })
})
