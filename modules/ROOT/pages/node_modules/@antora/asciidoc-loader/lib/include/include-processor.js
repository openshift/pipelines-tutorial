'use strict'

const Opal = global.Opal
const { $Antora } = require('../constants')

const DBL_COLON = '::'
const DBL_SQUARE = '[]'

const NEWLINE_RX = /\r\n?|\n/
const TAG_DIRECTIVE_RX = /\b(?:tag|(e)nd)::(\S+?)\[\](?=$|[ \r])/m

const IncludeProcessor = (() => {
  const $callback = Symbol('callback')
  const superclass = Opal.module(null, 'Asciidoctor').Extensions.IncludeProcessor
  const scope = Opal.klass(Opal.module(null, 'Antora', $Antora), superclass, 'IncludeProcessor', function () {})

  Opal.defn(scope, '$initialize', function initialize (callback) {
    Opal.send(this, Opal.find_super_dispatcher(this, 'initialize', initialize))
    this[$callback] = callback
  })

  Opal.defn(scope, '$process', function (doc, reader, target, attrs) {
    if (reader.include_stack.length >= Opal.hash_get(reader.maxdepth, 'abs')) {
      if (Opal.hash_get(reader.maxdepth, 'abs')) {
        log('error', `maximum include depth of ${Opal.hash_get(reader.maxdepth, 'rel')} exceeded`, reader)
      }
      return
    }
    const resolvedFile = this[$callback](doc, target, reader.getCursor())
    if (resolvedFile) {
      let includeContents
      let tags
      let startLineNum
      if ((tags = getTags(attrs))) {
        ;[includeContents, startLineNum] = applyTagFiltering(reader, target, resolvedFile, tags)
      } else {
        includeContents = resolvedFile.contents
        startLineNum = 1
      }
      Opal.hash_put(attrs, 'partial-option', true)
      reader.pushInclude(includeContents, resolvedFile.file, resolvedFile.path, startLineNum, attrs)
      ;(reader.file = new String(reader.file)).context = resolvedFile.context // eslint-disable-line no-new-wrappers
    } else {
      log('error', `include target not found: ${target}`, reader)
      reader.$unshift(`Unresolved include directive in ${reader.getCursor().file} - include::${target}[]`)
    }
  })

  return scope
})()

function getTags (attrs) {
  if (attrs['$key?']('tag')) {
    const tag = attrs['$[]']('tag')
    if (tag && tag !== '!') {
      return tag.charAt() === '!' ? new Map().set(tag.substr(1), false) : new Map().set(tag, true)
    }
  } else if (attrs['$key?']('tags')) {
    const tags = attrs['$[]']('tags')
    if (tags) {
      let result = new Map()
      let any = false
      tags.split(~tags.indexOf(',') ? ',' : ';').forEach((tag) => {
        if (tag && tag !== '!') {
          any = true
          tag.charAt() === '!' ? result.set(tag.substr(1), false) : result.set(tag, true)
        }
      })
      if (any) return result
    }
  }
}

function applyTagFiltering (reader, target, file, tags) {
  let selecting, selectingDefault, wildcard
  if (tags.has('**')) {
    if (tags.has('*')) {
      selectingDefault = selecting = tags.get('**')
      wildcard = tags.get('*')
      tags.delete('*')
    } else {
      selectingDefault = selecting = wildcard = tags.get('**')
    }
    tags.delete('**')
  } else {
    selectingDefault = selecting = !Array.from(tags.values()).includes(true)
    if (tags.has('*')) {
      wildcard = tags.get('*')
      tags.delete('*')
    }
  }

  const lines = []
  const tagStack = []
  const foundTags = []
  let activeTag
  let lineNum = 0
  let startLineNum
  file.contents.split(NEWLINE_RX).forEach((line) => {
    lineNum++
    let m
    let l = line
    if (~l.indexOf(DBL_COLON) && ~l.indexOf(DBL_SQUARE) && (m = l.match(TAG_DIRECTIVE_RX))) {
      const thisTag = m[2]
      if (m[1]) {
        if (thisTag === activeTag) {
          tagStack.shift()
          ;[activeTag, selecting] = tagStack.length ? tagStack[0] : [undefined, selectingDefault]
        } else if (tags.has(thisTag)) {
          const idx = tagStack.findIndex(([name]) => name === thisTag)
          if (~idx) {
            tagStack.splice(idx, 1)
            log(
              'warn',
              `mismatched end tag (expected '${activeTag}' but found '${thisTag}') ` +
                `at line ${lineNum} of include file: ${file.file})`,
              reader,
              reader.$create_include_cursor(file.file, target, lineNum)
            )
          } else {
            log(
              'warn',
              `unexpected end tag '${thisTag}' at line ${lineNum} of include file: ${file.file}`,
              reader,
              reader.$create_include_cursor(file.file, target, lineNum)
            )
          }
        }
      } else if (tags.has(thisTag)) {
        foundTags.push(thisTag)
        tagStack.unshift([(activeTag = thisTag), (selecting = tags.get(thisTag)), lineNum])
      } else if (wildcard !== undefined) {
        selecting = activeTag && !selecting ? false : wildcard
        tagStack.unshift([(activeTag = thisTag), selecting, lineNum])
      }
    } else if (selecting) {
      if (!startLineNum) startLineNum = lineNum
      lines.push(line)
    }
  })
  if (tagStack.length) {
    tagStack.forEach(([tagName, _, tagLineNum]) =>
      log(
        'warn',
        `detected unclosed tag '${tagName}' starting at line ${tagLineNum} of include file: ${file.file}`,
        reader,
        reader.$create_include_cursor(file.file, target, tagLineNum)
      )
    )
  }
  if (foundTags.length) foundTags.forEach((name) => tags.delete(name))
  if (tags.size) {
    const missingTagNames = Array.from(tags.keys())
    log(
      'warn',
      `tag${tags.size > 1 ? 's' : ''} '${missingTagNames.join(', ')}' not found in include file: ${file.file}`,
      reader
    )
  }
  return [lines, startLineNum || 1]
}

function log (severity, message, reader, includeCursor = undefined) {
  const opts = includeCursor
    ? { source_location: reader.getCursor(), include_location: includeCursor }
    : { source_location: reader.getCursor() }
  reader.$logger()['$' + severity](reader.$message_with_context(message, Opal.hash(opts)))
}

module.exports = IncludeProcessor
