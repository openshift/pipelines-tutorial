'use strict'

const { Readable } = require('stream')
const Vinyl = require('vinyl')

class File extends Vinyl {
  get relative () {
    return this.path
  }
}

class ReadableOutputFileArray extends Readable {
  constructor (array) {
    super({ objectMode: true })
    this.array = array.slice(0)
  }

  _read (size) {
    const read = this.array.splice(0, size)
    while (read.length) this.push(toOutputFile(read.shift()))
    if (!this.array.length) this.push(null)
  }
}

function toOutputFile (file) {
  // Q: do we also need to clone contents and stat?
  return new File({ contents: file.contents, path: file.out.path, stat: file.stat })
}

module.exports = ReadableOutputFileArray
