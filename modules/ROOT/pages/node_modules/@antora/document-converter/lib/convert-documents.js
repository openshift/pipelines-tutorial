'use strict'

const convertDocument = require('./convert-document')

/**
 * Converts the contents of AsciiDoc files in the content catalog to embeddable HTML.
 *
 * Finds all AsciiDoc files in the page family in the content catalog and converts the contents of
 * those files to embeddable HTML by delegating to the convertDocument function. The function then
 * returns all the files in the page family.  All the files returned from this function are expected
 * be composed (i.e., wrapped in an HTML layout) by the page composer.
 *
 * @memberof document-converter
 *
 * @param {ContentCatalog} contentCatalog - The catalog of all virtual content files in the site.
 * @param {Object} [asciidocConfig={}] - AsciiDoc processor configuration options.
 *
 * @returns {Array<File>} The virtual files in the page family taken from the content catalog.
 */
function convertDocuments (contentCatalog, asciidocConfig = {}) {
  return contentCatalog
    .findBy({ family: 'page' })
    .filter((page) => page.out)
    .map((page) => (page.mediaType === 'text/asciidoc' ? convertDocument(page, contentCatalog, asciidocConfig) : page))
}

module.exports = convertDocuments
module.exports.convertDocument = convertDocument
