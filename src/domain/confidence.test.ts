import { confidenceBand, confidenceLevel } from './confidence'

describe('confidenceBand', () => {
  it.each([
    [0, 'low'],
    [0.59, 'low'],
    [0.6, 'medium'],
    [0.79, 'medium'],
    [0.8, 'high'],
    [1, 'high'],
  ])('%s is %s', (value, band) => {
    expect(confidenceBand(value)).toBe(band)
  })
})

it('fills one, two or three meter segments', () => {
  expect([confidenceLevel('low'), confidenceLevel('medium'), confidenceLevel('high')]).toEqual([
    1, 2, 3,
  ])
})
