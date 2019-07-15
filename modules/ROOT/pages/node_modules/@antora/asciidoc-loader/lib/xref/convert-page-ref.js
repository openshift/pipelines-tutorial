'use strict'

const computeRelativeUrlPath = require('../util/compute-relative-url-path')
const splitOnce = require('../util/split-once')

/**
 * Converts the specified page reference to an HTML link.
 *
 * Parses the page reference (page ID and optional fragment), resolves the corresponding file from
 * the content catalog, then grabs its publication (root-relative) path. If the relativize param is
 * true, resolves the root relative path to a path relative to the URL of the current page. Uses the
 * resulting path to create an HTML link pointing to the published target page.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} refSpec - The target of the xref macro that specifies a page reference.
 * @param {String} content - The content (i.e., formatted text) of the link (undefined if not specified).
 * @param {File} currentPage - The virtual file for the current page.
 * @param {ContentCatalog} contentCatalog - The content catalog that contains the virtual files in the site.
 * @param {Boolean} [relativize=true] - Compute the target relative to the current page.
 * @returns {Object} A map ({ content, target }) with the resolved content and target to make an HTML link.
 */
function convertPageRef (refSpec, content, currentPage, contentCatalog, relativize = true) {
  let targetPage
  const [pageIdSpec, fragment] = splitOnce(refSpec, '#')
  try {
    if (!(targetPage = contentCatalog.resolvePage(pageIdSpec, currentPage.src))) {
      // TODO log "Unresolved page ID"
      return { content: `${pageIdSpec}.adoc${fragment ? '#' + fragment : ''}`, target: '#' }
    }
  } catch (e) {
    // TODO log "Invalid page ID syntax" (or e.message)
    return { content: refSpec, target: '#' }
  }

  const hash = fragment ? '#' + fragment : ''
  let target
  if (relativize) {
    target = computeRelativeUrlPath(currentPage.pub.url, targetPage.pub.url, hash)
  } else {
    target = targetPage.pub.url + hash
  }
  if (!content) content = `${pageIdSpec}.adoc${hash}`

  return { content, target }
}

module.exports = convertPageRef
