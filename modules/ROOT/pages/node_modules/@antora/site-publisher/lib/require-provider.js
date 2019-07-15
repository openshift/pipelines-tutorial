'use strict'

const ospath = require('path')

const DOT_RELATIVE_RX = new RegExp(`^\\.{1,2}[/${ospath.sep.replace('/', '').replace('\\', '\\\\')}]`)

/**
 * Generates a function to resolve and require a custom provider.
 *
 * @memberof site-publisher
 *
 * @returns {Function} A function to require a provider.
 */
function createRequireProvider () {
  const requestCache = new Map()
  /**
   * Requires a provider, first resolving the path if necessary.
   *
   * If the request is an absolute path, that value is used as is. If the
   * request begins with a dot (.), the value is resolved relative to the
   * specified base directory. Otherwise, the request is resolved as the name
   * of a node module, a search which includes the node_modules folder in the
   * specified base directory. The resolved value is then passed to the require
   * function and the result returned.
   *
   * @param {String} request - The path or module name to resolve.
   * @param {String} requireBase - The absolute path from which to resolve a
   *   relative path or module name.
   *
   * @returns {Object} The object returned by calling require on the resolved path.
   */
  return function requireProvider (request, requireBase) {
    let resolved = requestCache.get(request)
    if (!resolved) {
      if (request.charAt() === '.' && DOT_RELATIVE_RX.test(request)) {
        resolved = ospath.resolve(requireBase, request)
      } else if (ospath.isAbsolute(request)) {
        resolved = request
      } else {
        // NOTE appending node_modules prevents require from looking elsewhere before looking in these paths
        const paths = [requireBase, ospath.dirname(__dirname)].map((start) => ospath.join(start, 'node_modules'))
        resolved = require.resolve(request, { paths })
      }
      requestCache.set(request, resolved)
    }

    return require(resolved)
  }
}

module.exports = createRequireProvider
