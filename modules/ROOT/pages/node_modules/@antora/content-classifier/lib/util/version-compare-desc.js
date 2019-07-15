'use strict'

/**
 * A modified semantic version comparison function.
 *
 * Based on a semantic version comparison algorithm with the following enhancements:
 *
 * * Drops the leading "v" character from a semantic version, if present.
 * * Compares semantic versions in descending order (e.g., 2.0.0 comes before 1.0.0).
 * * Bubbles non-semantic versions to the top (e.g., dev, master).
 * * Compares non-semantic versions as strings.
 *
 * This function assumes the string is a semantic version if it contains a "." character.
 *
 * @param {String} a - The left version string.
 * @param {String} b - The right version string.
 * @returns 0 if the versions match, -1 if a is greater, or 1 if b is greater.
 */
function versionCompareDesc (a, b) {
  if (a === b) return 0
  const semverA = a.charAt() === 'v' ? a.substr(1) : a
  const semverB = b.charAt() === 'v' ? b.substr(1) : b
  if (~a.indexOf('.') || isNumber(semverA)) {
    return ~b.indexOf('.') || isNumber(semverB) ? -1 * semverCompare(semverA, semverB) : 1
  } else {
    return ~b.indexOf('.') || isNumber(semverB) ? -1 : -1 * a.localeCompare(b, 'en', { numeric: true })
  }
}

function isNumber (str) {
  return !isNaN(Number(str))
}

function semverCompare (a, b) {
  let preA
  let preB
  const preOffsetA = a.indexOf('-')
  const preOffsetB = b.indexOf('-')
  if (~preOffsetA) {
    preA = a.substr(preOffsetA + 1)
    a = a.substr(0, preOffsetA)
  }
  if (~preOffsetB) {
    preB = b.substr(preOffsetB + 1)
    b = b.substr(0, preOffsetB)
  }
  const numsA = a.split('.')
  const numsB = b.split('.')
  for (let i = 0; i < 3; i++) {
    const numA = numsA[i] ? Number(numsA[i]) : 0
    const numB = numsB[i] ? Number(numsB[i]) : 0
    if (numA > numB) {
      return 1
    } else if (numB > numA) {
      return -1
    } else if (isNaN(numA)) {
      if (!isNaN(numB)) return -1
    } else if (isNaN(numB)) {
      return 1
    }
  }
  if (preA == null) {
    return preB == null ? 0 : 1
  } else {
    return preB == null ? -1 : preA.localeCompare(preB, 'en', { numeric: true })
  }
}

module.exports = versionCompareDesc
