'use strict'

const { posix: path } = require('path')
const splitOnce = require('../util/split-once')

const { EXAMPLES_DIR_TOKEN, PARTIALS_DIR_TOKEN } = require('../constants')
const RESOURCE_ID_DETECTOR_RX = /[$:@]/

/**
 * Resolves the specified include target to a virtual file in the content catalog.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} target - The target of the include directive to resolve.
 * @param {File} page - The outermost virtual file from which the include originated (not
 *   necessarily the current file).
 * @param {Cursor} cursor - The cursor of the reader for file that contains the include directive.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {Object} A map containing the file, path, and contents of the resolved file.
 */
function resolveIncludeFile (target, page, cursor, catalog) {
  const ctx = (cursor.file || {}).context || page.src
  let resolved
  let family
  let relative
  if (RESOURCE_ID_DETECTOR_RX.test(target)) {
    // NOTE support legacy {partialsdir} and {examplesdir} prefixes (same as resource ID w/ only family and relative)
    if (target.startsWith(PARTIALS_DIR_TOKEN) || target.startsWith(EXAMPLES_DIR_TOKEN)) {
      ;[family, relative] = splitOnce(target, '$')
      if (relative.charAt() === '/') relative = relative.substr(1)
      resolved = catalog.getById({
        component: ctx.component,
        version: ctx.version,
        module: ctx.module,
        family,
        relative,
      })
      // NOTE require family segment for now
    } else if (~target.indexOf('$')) {
      resolved = catalog.resolveResource(target, selectResourceId(ctx))
    }
  } else {
    resolved = catalog.getByPath({
      component: ctx.component,
      version: ctx.version,
      // QUESTION does cursor.dir always contain the value we expect?
      path: path.join(cursor.dir.toString(), target),
    })
  }
  if (resolved) {
    const resolvedSrc = resolved.src
    return {
      context: resolvedSrc,
      file: resolvedSrc.path,
      path: resolvedSrc.basename,
      // NOTE src.contents is set if page is marked as a partial
      // TODO if include file is a page, warn if not marked as a partial
      contents: (resolvedSrc.contents || resolved.contents).toString(),
    }
  }
}

function selectResourceId ({ component, version, module, family, relative }) {
  return { component, version, module, family, relative }
}

module.exports = resolveIncludeFile
