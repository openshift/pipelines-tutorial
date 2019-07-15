'use strict'

// IMPORTANT eagerly load Opal to force the String encoding from UTF-16LE to UTF-8
const Opal = require('opal-runtime').Opal
if ('encoding' in String.prototype && String(String.prototype.encoding) !== 'UTF-8') {
  String.prototype.encoding = Opal.const_get_local(Opal.const_get_qualified('::', 'Encoding'), 'UTF_8') // eslint-disable-line no-extend-native
}

const asciidoctor = require('asciidoctor.js')()
const Extensions = asciidoctor.Extensions
const convertPageRef = require('./xref/convert-page-ref')
const createConverter = require('./converter/create')
const createExtensionRegistry = require('./create-extension-registry')
const ospath = require('path')
const { posix: path } = ospath
const resolveIncludeFile = require('./include/resolve-include-file')

const DOT_RELATIVE_RX = new RegExp(`^\\.{1,2}[/${ospath.sep.replace('/', '').replace('\\', '\\\\')}]`)
const { EXAMPLES_DIR_TOKEN, PARTIALS_DIR_TOKEN } = require('./constants')
const EXTENSION_DSL_TYPES = Extensions.$constants(false).filter((name) => name.endsWith('Dsl'))

/**
 * Loads the AsciiDoc source from the specified file into a Document object.
 *
 * Uses the Asciidoctor.js load API to parse the source of the file into an Asciidoctor Document object. Sets options
 * and attributes that provide integration with the Antora environment. Options include a custom converter and extension
 * registry to handle page references and include directives, respectively. It also assigns attributes that provide
 * context either for the author (e.g., env=site) or pipeline (e.g., docfile).
 *
 * @memberof asciidoc-loader
 *
 * @param {File} file - The virtual file whose contents is an AsciiDoc source document.
 * @param {ContentCatalog} [contentCatalog=undefined] - The catalog of all virtual content files in the site.
 * @param {Object} [config={}] - AsciiDoc processor configuration options.
 * @param {Object} [config.attributes={}] - Shared AsciiDoc attributes to assign to the document.
 * @param {Array<Function>} [config.extensions=[]] - Self-registering AsciiDoc processor extension functions.
 * @param {Boolean} [config.relativizePageRefs=true] - Configures the AsciiDoc processor to generate relative page
 *   references (relative to the current page) instead of root relative (relative to the site root).
 *
 * @returns {Document} An Asciidoctor Document object created from the source of the specified file.
 */
function loadAsciiDoc (file, contentCatalog = undefined, config = {}) {
  const fileSrc = file.src
  const relative = fileSrc.relative
  const extname = fileSrc.extname || relative.replace(/.*(?=\.)/g, '')
  const intrinsicAttrs = {
    docname: relative.substr(0, relative.length - extname.length),
    docfile: file.path,
    // NOTE docdir implicitly sets base_dir on document; Opal only expands value to absolute path if it starts with ./
    docdir: file.dirname,
    docfilesuffix: extname,
    imagesdir: path.join(file.pub.moduleRootPath, '_images'),
    attachmentsdir: path.join(file.pub.moduleRootPath, '_attachments'),
    examplesdir: EXAMPLES_DIR_TOKEN,
    partialsdir: PARTIALS_DIR_TOKEN,
  }
  const pageAttrs = fileSrc.family === 'page' ? computePageAttrs(fileSrc, contentCatalog) : undefined
  const attributes = Object.assign({}, config.attributes, intrinsicAttrs, pageAttrs)
  const relativizePageRefs = config.relativizePageRefs !== false
  const converter = createConverter({
    onPageRef: (refSpec, content) => convertPageRef(refSpec, content, file, contentCatalog, relativizePageRefs),
  })
  const extensionRegistry = createExtensionRegistry(asciidoctor, {
    onInclude: (doc, target, cursor) => resolveIncludeFile(target, file, cursor, contentCatalog),
  })
  const extensions = config.extensions || []
  if (extensions.length) {
    extensions.forEach((extension) => extension.register(extensionRegistry, { file, contentCatalog, config }))
  }
  const opts = { attributes, converter, extension_registry: extensionRegistry, safe: 'safe' }
  if (config.doctype) opts.doctype = config.doctype
  const doc = asciidoctor.load(file.contents.toString(), opts)
  if (extensions.length) freeExtensions()
  return doc
}

function computePageAttrs (fileSrc, contentCatalog) {
  const attrs = {}
  // QUESTION should we soft set the page-id attribute?
  attrs['page-component-name'] = fileSrc.component
  attrs['page-component-version'] = attrs['page-version'] = fileSrc.version
  const component = contentCatalog && contentCatalog.getComponent(fileSrc.component)
  if (component) attrs['page-component-title'] = component.title
  attrs['page-module'] = fileSrc.module
  attrs['page-relative'] = fileSrc.relative
  const origin = fileSrc.origin
  if (origin) {
    attrs['page-origin-type'] = origin.type
    attrs['page-origin-url'] = origin.url
    attrs['page-origin-start-path'] = origin.startPath
    if (origin.branch) {
      attrs['page-origin-refname'] = attrs['page-origin-branch'] = origin.branch
      attrs['page-origin-reftype'] = 'branch'
    } else if (origin.tag) {
      attrs['page-origin-refname'] = attrs['page-origin-tag'] = origin.tag
      attrs['page-origin-reftype'] = 'tag'
    }
    if (origin.worktree) attrs['page-origin-worktree'] = ''
  }
  return attrs
}

/**
 * Resolves a global AsciiDoc configuration object from data in the playbook.
 *
 * Reads data from the asciidoc category of the playbook and resolves it into a global AsciiDoc configuration object
 * that can be used by the loadAsciiDoc function. This configuration object consists of built-in attributes as well as a
 * shallow clone of the data from the asciidoc category in the playbook.
 *
 * The main purpose of this function is to resolve extension references in the playbook to extension
 * functions. If the extension is scoped, the function is stored in this object. If the extension is global, it is
 * registered with the global extension registry, then discarded.
 *
 * @memberof asciidoc-loader
 *
 * @param {Object} playbook - The configuration object for Antora (default: {}).
 * @param {Object} playbook.asciidoc - The AsciiDoc configuration data in the playbook.
 *
 * @returns {Object} A resolved configuration object to be used by the loadAsciiDoc function.
 */
function resolveConfig (playbook = {}) {
  const attributes = {
    env: 'site',
    'env-site': '',
    'site-gen': 'antora',
    'site-gen-antora': '',
    'attribute-missing': 'warn',
    'data-uri': null,
    icons: 'font',
    sectanchors: '',
    'source-highlighter': 'highlight.js',
  }
  if (playbook.site) {
    const site = playbook.site
    if (site.title) attributes['site-title'] = site.title
    if (site.url) attributes['site-url'] = site.url
  }
  const config = { attributes }
  if (!playbook.asciidoc) return config
  // TODO process !name attributes
  Object.assign(config, playbook.asciidoc, { attributes: Object.assign(attributes, playbook.asciidoc.attributes) })
  if (config.extensions && config.extensions.length) {
    const extensions = config.extensions.reduce((accum, extensionPath) => {
      if (extensionPath.charAt() === '.' && DOT_RELATIVE_RX.test(extensionPath)) {
        // NOTE require resolves a dot-relative path relative to current file; resolve relative to playbook dir instead
        extensionPath = ospath.resolve(playbook.dir, extensionPath)
      } else if (!ospath.isAbsolute(extensionPath)) {
        // NOTE appending node_modules prevents require from looking elsewhere before looking in these paths
        const paths = [playbook.dir, ospath.dirname(__dirname)].map((start) => ospath.join(start, 'node_modules'))
        extensionPath = require.resolve(extensionPath, { paths })
      }
      const extension = require(extensionPath)
      if ('register' in extension) {
        accum.push(extension)
      } else if (!isExtensionRegistered(extension, Extensions)) {
        // QUESTION should we assign an antora-specific group name?
        Extensions.register(extension)
      }
      return accum
    }, [])
    if (extensions.length) {
      config.extensions = extensions
    } else {
      delete config.extensions
    }
  } else {
    delete config.extensions
  }
  return config
}

function isExtensionRegistered (ext, registry) {
  return Object.values(registry.getGroups()).includes(ext)
}

/**
 * Low-level operation to free objects from memory that have been weaved into an extension DSL module
 */
function freeExtensions () {
  EXTENSION_DSL_TYPES.forEach((type) => (Opal.const_get_local(Extensions, type).$$iclasses.length = 0))
}

module.exports = loadAsciiDoc
module.exports.resolveConfig = resolveConfig
