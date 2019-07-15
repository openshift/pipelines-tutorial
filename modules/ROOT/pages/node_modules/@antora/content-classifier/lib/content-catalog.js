'use strict'

const _ = require('lodash')
const File = require('./file')
const parseResourceId = require('./util/parse-resource-id')
const { posix: path } = require('path')
const resolveResource = require('./util/resolve-resource')
const versionCompare = require('./util/version-compare-desc')

const { START_PAGE_ID } = require('./constants')

const $components = Symbol('components')
const $files = Symbol('files')
const $generateId = Symbol('generateId')

class ContentCatalog {
  constructor (playbook) {
    this[$components] = {}
    this[$files] = {}
    this.htmlUrlExtensionStyle = _.get(playbook, ['urls', 'htmlExtensionStyle'], 'default')
    //this.urlRedirectFacility = _.get(playbook, ['urls', 'redirectFacility'], 'static')
  }

  registerComponentVersion (name, version, { displayVersion, prerelease, title, startPage } = {}) {
    const startPageSpec = startPage
    startPage = this.resolvePage(startPageSpec || 'index.adoc', { component: name, version, module: 'ROOT' })
    if (!startPage) {
      if (startPageSpec) throw new Error(`Start page specified for ${version}@${name} not found: ` + startPageSpec)
      // TODO throw error or report warning; for now, we're just faking it
      //throw new Error(`Start page for ${version}@${name} not specified and no index page found.`)
      const startPageSrc = expandPageSrc({ component: name, version, module: 'ROOT', relative: 'index.adoc' })
      const startPageOut = computeOut(startPageSrc, startPageSrc.family, this.htmlUrlExtensionStyle)
      const startPagePub = computePub(startPageSrc, startPageOut, startPageSrc.family, this.htmlUrlExtensionStyle)
      startPage = { pub: startPagePub }
    }
    const componentVersion = {
      version,
      displayVersion: displayVersion || version,
      title: title || name,
      url: startPage.pub.url,
    }
    if (prerelease) {
      componentVersion.prerelease = prerelease
      if (!displayVersion && (typeof prerelease === 'string' || prerelease instanceof String)) {
        const sep = prerelease.startsWith('-') || prerelease.startsWith('.') ? '' : ' '
        componentVersion.displayVersion = `${version}${sep}${prerelease}`
      }
    }
    const component = this[$components][name]
    if (component) {
      const componentVersions = component.versions
      const insertIdx = componentVersions.findIndex(({ version: candidate }) => {
        if (candidate === version) throw new Error(`Duplicate version detected for component ${name}: ${version}`)
        return versionCompare(candidate, version) > 0
      })
      if (~insertIdx) {
        componentVersions.splice(insertIdx, 0, componentVersion)
      } else {
        componentVersions.push(componentVersion)
      }
      component.latest = componentVersions.find((candidate) => !candidate.prerelease) || componentVersions[0]
    } else {
      this[$components][name] = Object.defineProperties(
        { name, latest: componentVersion, versions: [componentVersion] },
        {
          // NOTE alias latestVersion to latest for backwards compatibility
          latestVersion: {
            get: function () {
              return this.latest
            },
          },
          title: {
            get: function () {
              return this.latest.title
            },
          },
          url: {
            get: function () {
              return this.latest.url
            },
          },
        }
      )
    }
  }

  // QUESTION should this method return the file added?
  addFile (file) {
    const id = this[$generateId](file.src)
    if (this[$files][id]) {
      throw new Error(`Duplicate ${file.src.family}: ${id.replace(':' + file.src.family + '$', ':')}`)
    }
    if (!File.isVinyl(file)) file = new File(file)
    const family = file.src.family
    const actingFamily = family === 'alias' ? file.rel.src.family : family
    let publishable
    if (file.out) {
      publishable = true
    } else if (
      (actingFamily === 'page' || actingFamily === 'image' || actingFamily === 'attachment') &&
      !~('/' + file.src.relative).indexOf('/_')
    ) {
      publishable = true
      file.out = computeOut(file.src, actingFamily, this.htmlUrlExtensionStyle)
    }
    if (!file.pub && (publishable || actingFamily === 'nav')) {
      file.pub = computePub(file.src, file.out, actingFamily, this.htmlUrlExtensionStyle)
    }
    this[$files][id] = file
  }

  findBy (criteria) {
    return _.filter(this[$files], { src: criteria })
  }

  getById ({ component, version, module, family, relative }) {
    const id = this[$generateId]({ component, version, module, family, relative })
    return this[$files][id]
  }

  getByPath ({ component, version, path: path_ }) {
    return _.find(this[$files], { path: path_, src: { component, version } })
  }

  getComponent (name) {
    return this[$components][name]
  }

  getComponentVersion (component, version) {
    return (component.versions || (this.getComponent(component) || {}).versions || []).find(
      (candidate) => candidate.version === version
    )
  }

  getComponentMap () {
    return Object.assign({}, this[$components])
  }

  getComponentMapSortedBy (property) {
    return this.getComponentsSortedBy(property).reduce((accum, it) => (accum[it.name] = it) && accum, {})
  }

  getComponents () {
    return Object.values(this[$components])
  }

  getComponentsSortedBy (property) {
    return this.getComponents().sort((a, b) => a[property].localeCompare(b[property]))
  }

  getFiles () {
    return Object.values(this[$files])
  }

  // TODO add `follow` argument to control whether alias is followed
  getSiteStartPage () {
    const page = this.getById(START_PAGE_ID) || this.getById(Object.assign({}, START_PAGE_ID, { family: 'alias' }))
    if (page) return page.src.family === 'alias' ? page.rel : page
  }

  // QUESTION should this be addPageAlias?
  registerPageAlias (aliasSpec, targetPage) {
    const src = parseResourceId(aliasSpec, targetPage.src, ['page'])
    // QUESTION should we throw an error if alias is invalid?
    if (!src) return
    const component = this.getComponent(src.component)
    if (component) {
      // NOTE version is not set when alias specifies a component, but not a version
      if (!src.version) src.version = component.latest.version
      const existingPage = this.getById(src)
      if (existingPage) {
        // TODO we'll need some way to easily get a displayable page ID
        let qualifiedSpec = this[$generateId](existingPage.src)
        qualifiedSpec = qualifiedSpec.replace(':page$', ':')
        const message = `Page alias cannot reference ${targetPage === existingPage ? 'itself' : 'an existing page'}`
        throw new Error(message + ': ' + qualifiedSpec)
      }
    } else if (!src.version) {
      // QUESTION is this correct to assume?
      src.version = 'master'
    }
    expandPageSrc(src, 'alias')
    // QUESTION should we use src.origin instead of rel with type='link'?
    //src.origin = { type: 'link', target: targetPage }
    // NOTE the redirect producer will populate contents when the redirect facility is 'static'
    // QUESTION should we set the path property on the alias file?
    const file = new File({ path: targetPage.path, mediaType: src.mediaType, src, rel: targetPage })
    this.addFile(file)
    return file
  }

  /**
   * Attempts to resolve a string contextual page ID spec to a file in the catalog.
   *
   * Parses the specified contextual page ID spec into a page ID object, then attempts to lookup a
   * file with this page ID in the catalog. If a component is specified, but not a version, the
   * latest version of the component stored in the catalog is used. If a file cannot be resolved,
   * the function returns undefined. If the spec does not match the page ID syntax, this function
   * throws an error.
   *
   * @param {String} spec - The contextual page ID spec (e.g.,
   *   version@component:module:topic/page followed by optional .adoc extension).
   * @param {ContentCatalog} catalog - The content catalog in which to resolve the page file.
   * @param {Object} [ctx={}] - The context to use to qualified the contextual page ID.
   *
   * @return {File} The virtual file to which the contextual page ID spec refers, or undefined if the
   * file cannot be resolved.
   */
  resolvePage (spec, context = {}) {
    return resolveResource(spec, this, context, ['page'])
  }

  resolveResource (spec, context = {}, permittedFamilies = undefined, defaultFamily = undefined) {
    return resolveResource(spec, this, context, permittedFamilies, defaultFamily)
  }

  [$generateId] ({ component, version, module, family, relative }) {
    return `${version}@${component}:${module}:${family}$${relative}`
  }
}

function expandPageSrc (src, family = 'page') {
  src.family = family
  src.basename = path.basename(src.relative)
  src.extname = path.extname(src.relative)
  src.stem = path.basename(src.relative, src.extname)
  src.mediaType = 'text/asciidoc'
  return src
}

function computeOut (src, family, htmlUrlExtensionStyle) {
  const component = src.component
  const version = src.version === 'master' ? '' : src.version
  const module = src.module === 'ROOT' ? '' : src.module

  const stem = src.stem
  let basename = src.mediaType === 'text/asciidoc' ? stem + '.html' : src.basename
  let indexifyPathSegment = ''
  if (family === 'page' && stem !== 'index' && htmlUrlExtensionStyle === 'indexify') {
    basename = 'index.html'
    indexifyPathSegment = stem
  }

  let familyPathSegment = ''
  if (family === 'image') {
    familyPathSegment = '_images'
  } else if (family === 'attachment') {
    familyPathSegment = '_attachments'
  }

  const modulePath = path.join(component, version, module)
  const dirname = path.join(modulePath, familyPathSegment, path.dirname(src.relative), indexifyPathSegment)
  const path_ = path.join(dirname, basename)
  const moduleRootPath = path.relative(dirname, modulePath) || '.'
  const rootPath = path.relative(dirname, '') || '.'

  return {
    dirname,
    basename,
    path: path_,
    moduleRootPath,
    rootPath,
  }
}

function computePub (src, out, family, htmlUrlExtensionStyle) {
  const pub = {}
  let url
  if (family === 'nav') {
    const urlSegments = [src.component]
    if (src.version !== 'master') urlSegments.push(src.version)
    if (src.module && src.module !== 'ROOT') urlSegments.push(src.module)
    // an artificial URL used for resolving page references in navigation model
    url = '/' + urlSegments.join('/') + '/'
    pub.moduleRootPath = '.'
  } else if (family === 'page') {
    const urlSegments = out.path.split('/')
    const lastUrlSegmentIdx = urlSegments.length - 1
    if (htmlUrlExtensionStyle === 'drop') {
      // drop just the .html extension or, if the filename is index.html, the whole segment
      const lastUrlSegment = urlSegments[lastUrlSegmentIdx]
      urlSegments[lastUrlSegmentIdx] =
        lastUrlSegment === 'index.html' ? '' : lastUrlSegment.substr(0, lastUrlSegment.length - 5)
    } else if (htmlUrlExtensionStyle === 'indexify') {
      urlSegments[lastUrlSegmentIdx] = ''
    }
    url = '/' + urlSegments.join('/')
  } else {
    url = '/' + out.path
  }

  pub.url = url

  if (out) {
    pub.moduleRootPath = out.moduleRootPath
    pub.rootPath = out.rootPath
  }

  return pub
}

module.exports = ContentCatalog
