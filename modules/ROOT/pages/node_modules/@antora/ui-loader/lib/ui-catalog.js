'use strict'

const _ = require('lodash')

const $files = Symbol('files')
const $generateId = Symbol('generateId')

class UiCatalog {
  constructor () {
    this[$files] = {}
  }

  getFiles () {
    return Object.values(this[$files])
  }

  addFile (file) {
    const id = this[$generateId](file)
    if (id in this[$files]) {
      throw new Error('Duplicate file')
    }
    this[$files][id] = file
  }

  findByType (type) {
    return _.filter(this[$files], { type })
  }

  [$generateId] (file) {
    return [file.type, ...file.path.split('/')]
  }
}

module.exports = UiCatalog
