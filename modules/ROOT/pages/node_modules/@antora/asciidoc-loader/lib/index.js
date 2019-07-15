'use strict'

/**
 * AsciiDoc Loader component for Antora
 *
 * Uses Asciidoctor.js to load AsciiDoc content in a way that integrates with
 * the Antora environment. In particular, it resolves include files and page
 * references from Antora's virtual content catalog.
 *
 * @namespace asciidoc-loader
 */
module.exports = require('./load-asciidoc')
