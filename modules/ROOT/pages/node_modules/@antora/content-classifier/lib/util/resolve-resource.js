'use strict'

const parseResourceId = require('./parse-resource-id')

/**
 * Attempts to resolve a contextual resource ID spec to a file in the catalog.
 *
 * Parses the specified contextual resource ID spec into a resource ID object using parseResourceId,
 * then attempts to locate a file with this resource the catalog. If a component is specified, but
 * not a version, the latest version of the component is used from the catalog. If a file cannot be
 * resolved, the function returns undefined. If the spec does not match the resource ID syntax, this
 * function throws an error.
 *
 * @memberof content-classifier
 *
 * @param {String} spec - The contextual resource ID spec (e.g., version@component:module:family$relative).
 * @param {ContentCatalog} catalog - The content catalog in which to resolve the page file.
 * @param {Object} [ctx={}] - The src context.
 * @param {Array<String>} [permittedFamilies=undefined] - An optional array of permitted family names.
 * @param {String} [defaultFamily=undefined] - The default family to use if family is not specified in spec.
 *   If not specified, and spec is missing a family, the family will default to "page".
 *
 * @return {File} The virtual file to which the contextual resource ID spec refers, or undefined if
 * the file cannot be resolved.
 */
function resolveResource (spec, catalog, ctx = {}, permittedFamilies = undefined, defaultFamily = undefined) {
  const id = parseResourceId(spec, ctx, permittedFamilies, defaultFamily)

  if (!id) throw new Error(`Invalid ${defaultFamily || 'resource'} ID syntax`)
  if (!id.family) return

  if (!id.version) {
    const component = catalog.getComponent(id.component)
    if (!component) return
    id.version = component.latest.version
  }

  return catalog.getById(id)
}

module.exports = resolveResource
