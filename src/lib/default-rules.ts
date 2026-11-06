import type { APPortfolio } from './types'

/** The Python distribution, including its unassigned gaps.
 * 5255 and 5266 belong to Jason: his earlier condition catches them before Steven.
 * They are omitted from Steven's explicit list to preserve that effective behavior. */
export const DEFAULT_RULES: APPortfolio[] = [
  { id: 'angie', name: 'Angie Cardona', ranges: [{ start: 5006, end: 5216 }], include: [5260, 5261], exclude: [5061, 5266, 5133, 5134, 5135, 5167, 5198, 5200, 5255] },
  { id: 'jason', name: 'Jason Jin', ranges: [{ start: 5218, end: 5337 }], include: [5200], exclude: [5260, 5261, 5256, 5257, 5258] },
  { id: 'david', name: 'David Wong', ranges: [{ start: 5339, end: 5527 }], include: [], exclude: [5377, 5381, 5386, 5504, 5521] },
  { id: 'anson', name: 'Anson Lau', ranges: [{ start: 5528, end: 5626 }], include: [], exclude: [5594, 5598, 5556, 5571] },
  { id: 'narges', name: 'Narges Hadipour', ranges: [{ start: 5627, end: 5720 }], include: [], exclude: [5661, 5699] },
  { id: 'ruby', name: 'Ruby Tam', ranges: [{ start: 5721, end: 5790 }], include: [], exclude: [5739, 5750, 5767, 5769, 5775] },
  { id: 'steven', name: 'Steven Leung', ranges: [{ start: 5791, end: null }], include: [5061, 5133, 5134, 5135, 5198, 5167, 5256, 5257, 5258, 5594, 5598, 5377, 5381, 5386, 5504, 5521, 5556, 5571, 5661, 5699, 5739, 5750, 5767, 5769, 5775], exclude: [] },
]

export function freshDefaultRules(): APPortfolio[] {
  return JSON.parse(JSON.stringify(DEFAULT_RULES)) as APPortfolio[]
}
