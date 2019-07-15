'use strict'

const Html5Converter = require('./html5')

/**
 * Creates an HTML5 converter instance with Antora enhancements.
 *
 * @memberof asciidoc-loader
 *
 * @param {Object} callbacks - Callback functions.
 * @param {Function} callbacks.onPageRef - A function that converts a page reference.
 *
 * @returns {Converter} An enhanced instance of Asciidoctor's HTML5 converter.
 */
function createConverter (callbacks) {
  return Html5Converter.$new('html5', undefined, callbacks)
}

module.exports = createConverter
