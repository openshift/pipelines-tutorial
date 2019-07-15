'use strict'

const handlebars = require('handlebars')
const { posix: path } = require('path')
const requireFromString = require('require-from-string')

const { DEFAULT_LAYOUT_NAME, HANDLEBARS_COMPILE_OPTIONS } = require('./constants')
const { version: VERSION } = require('../package.json')

/**
 * Generates a function to wrap the page contents in a page layout.
 *
 * Compiles the Handlebars layouts, along with the partials and helpers, and
 * builds the shared site UI model. Passes these objects to a generated
 * function, which can then be used to apply a layout template to pages.
 *
 * @memberof page-composer
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {ContentCatalog} contentCatalog - The content catalog
 *   that provides access to the virtual files in the site.
 * @param {UiCatalog} uiCatalog - The file catalog
 *   that provides access to the UI files for the site.
 * @param {Object} [env=process.env] - A map of environment variables.
 * @returns {Function} A function to compose a page (i.e., wrap the embeddable
 *   HTML contents in a standalone page layout).
 */
function createPageComposer (playbook, contentCatalog, uiCatalog, env = process.env) {
  uiCatalog
    .findByType('helper')
    .forEach((file) => handlebars.registerHelper(file.stem, requireFromString(file.contents.toString(), file.path)))

  uiCatalog.findByType('partial').forEach((file) => handlebars.registerPartial(file.stem, file.contents.toString()))

  const layouts = uiCatalog
    .findByType('layout')
    .reduce(
      (accum, file) => accum.set(file.stem, handlebars.compile(file.contents.toString(), HANDLEBARS_COMPILE_OPTIONS)),
      new Map()
    )

  return createPageComposerInternal(buildSiteUiModel(playbook, contentCatalog), env, layouts)
}

function createPageComposerInternal (site, env, layouts) {
  /**
   * Wraps the embeddable HTML contents of the specified file in a page layout.
   *
   * Builds a UI model from the file and its context, executes on the specified
   * page layout on that model, and assigns the result to the contents property
   * of the file. If no layout is specified on the file, the default layout is
   * used.
   *
   * @memberof page-composer
   *
   * @param {File} file - The virtual file the contains embeddable HTML
   *   contents to wrap in a layout.
   * @param {ContentCatalog} contentCatalog - The content catalog
   *   that provides access to the virtual files in the site.
   * @param {NavigationCatalog} navigationCatalog - The navigation catalog
   *   that provides access to the navigation for each component version.
   * @returns {File} The file whose contents were wrapped in the specified page layout.
   */
  return function composePage (file, contentCatalog, navigationCatalog) {
    // QUESTION should we pass the playbook to the uiModel?
    const uiModel = buildUiModel(file, contentCatalog, navigationCatalog, site, env)

    let layout = uiModel.page.layout
    if (!layouts.has(layout)) {
      if (layout === '404') throw new Error('404 layout not found')
      const defaultLayout = uiModel.site.ui.defaultLayout
      if (defaultLayout === layout) {
        throw new Error(`${layout} layout not found`)
      } else if (!layouts.has(defaultLayout)) {
        throw new Error(`Neither ${layout} layout or fallback ${defaultLayout} layout found`)
      }
      // TODO log a warning that the default template is being used; perhaps on file?
      layout = defaultLayout
    }

    // QUESTION should we call trim() on result?
    file.contents = Buffer.from(layouts.get(layout)(uiModel))
    return file
  }
}

function buildUiModel (file, contentCatalog, navigationCatalog, site, env) {
  return {
    antoraVersion: VERSION,
    env,
    page: buildPageUiModel(file, contentCatalog, navigationCatalog, site),
    site,
    siteRootPath: file.pub.rootPath,
    uiRootPath: path.join(file.pub.rootPath, site.ui.url),
  }
}

function buildSiteUiModel (playbook, contentCatalog) {
  const model = { title: playbook.site.title }

  let siteUrl = playbook.site.url
  if (siteUrl) {
    if (siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
    model.url = siteUrl
  }

  const startPage = contentCatalog.getSiteStartPage()
  if (startPage) model.homeUrl = startPage.pub.url

  // QUESTION should components be pre-sorted? should we make this configurable?
  model.components = contentCatalog.getComponentMapSortedBy('title')

  model.keys = Object.entries(playbook.site.keys || {}).reduce((accum, [key, value]) => {
    if (value) accum[key] = value
    return accum
  }, {})

  const uiConfig = playbook.ui
  model.ui = {
    url: path.resolve('/', uiConfig.outputDir),
    defaultLayout: uiConfig.defaultLayout || DEFAULT_LAYOUT_NAME,
  }

  return model
}

function buildPageUiModel (file, contentCatalog, navigationCatalog, site) {
  const { component: componentName, version, stem } = file.src

  if (!componentName && stem === '404') return { layout: stem, title: file.title }

  // QUESTION should attributes be scoped to AsciiDoc, or should this work regardless of markup language? file.data?
  const asciidoc = file.asciidoc || {}
  const attributes = asciidoc.attributes || {}
  const pageAttributes = Object.entries(attributes).reduce((accum, [name, val]) => {
    if (name.startsWith('page-')) accum[name.substr(5)] = val
    return accum
  }, {})

  const url = file.pub.url
  const component = contentCatalog.getComponent(componentName)
  const componentVersion = contentCatalog.getComponentVersion(component, version)
  // QUESTION can we cache versions on file.rel so only computed once per page version lineage?
  const versions = component.versions.length > 1 ? getPageVersions(file.src, component, contentCatalog) : undefined
  const navigation = navigationCatalog.getNavigation(componentName, version) || []
  const title = asciidoc.doctitle

  const model = {
    contents: file.contents,
    layout: pageAttributes.layout || site.ui.defaultLayout,
    title,
    url,
    description: attributes.description,
    keywords: attributes.keywords,
    attributes: pageAttributes,
    component,
    version,
    displayVersion: componentVersion.displayVersion,
    componentVersion,
    module: file.src.module,
    origin: file.src.origin,
    versions,
    navigation,
    editUrl: file.src.editUrl,
    home: url === site.homeUrl,
  }
  Object.defineProperty(model, 'latest', {
    get () {
      return this.versions && this.versions.find((candidate) => candidate.latest)
    },
  })
  Object.assign(model, getNavContext(url, title, navigation))

  if (site.url) {
    // NOTE not always the same as the latest component version (since the page might cease to exist)
    const latestPageVersion = versions
      ? versions.find((candidate) => !candidate.prerelease)
      : !componentVersion.prerelease && { url }
    if (latestPageVersion) model.canonicalUrl = file.pub.canonicalUrl = site.url + latestPageVersion.url
  }

  return model
}

function getNavContext (url, title, navigation) {
  const navContext = { breadcrumbs: [] }
  const { current, ancestors, previous, next } = findNavItem({ url, ancestors: [], seekNext: true }, navigation)
  if (current) {
    // QUESTION should we filter out component start page from the breadcrumbs?
    const breadcrumbs = ancestors.filter((item) => 'content' in item)
    const parent = breadcrumbs.find((item) => item.urlType === 'internal')
    breadcrumbs.reverse().push(current)
    navContext.breadcrumbs = breadcrumbs
    if (parent) navContext.parent = parent
    if (previous) navContext.previous = previous
    if (next) navContext.next = next
  } else if (title) {
    navContext.breadcrumbs = [{ content: title, url, urlType: 'internal', discrete: true }]
  }
  return navContext
}

function findNavItem (correlated, siblings, root = true, siblingIdx = 0, candidate = undefined) {
  if (!(candidate = candidate || siblings[siblingIdx])) {
    return correlated
  } else if (correlated.current) {
    if (candidate.urlType === 'internal') {
      correlated.next = candidate
      return correlated
    }
  } else if (candidate.urlType === 'internal') {
    if (getUrlWithoutHash(candidate) === correlated.url) {
      correlated.current = candidate
      /* istanbul ignore if */
      if (!correlated.seekNext) return correlated
    } else {
      correlated.previous = candidate
    }
  }
  const children = candidate.items || []
  if (children.length) {
    const ancestors = correlated.ancestors
    correlated = findNavItem(
      correlated.current ? correlated : Object.assign({}, correlated, { ancestors: [candidate].concat(ancestors) }),
      children,
      false
    )
    if (correlated.current) {
      if (!correlated.seekNext || correlated.next) return correlated
    } else {
      correlated.ancestors = ancestors
    }
  }
  if ((siblingIdx += 1) < siblings.length) {
    correlated = findNavItem(correlated, siblings, root, siblingIdx)
    //if (correlated.current && (!correlated.seekNext || correlated.next)) return correlated
  } else if (root && !correlated.current) {
    delete correlated.previous
  }
  return correlated
}

function getUrlWithoutHash (item) {
  return item.hash ? item.url.substr(0, item.url.length - item.hash.length) : item.url
}

// QUESTION should this function go in ContentCatalog?
// QUESTION should this function accept component, module, relative instead of pageSrc?
function getPageVersions (pageSrc, component, contentCatalog) {
  const basePageId = {
    component: pageSrc.component,
    module: pageSrc.module,
    family: 'page',
    relative: pageSrc.relative,
  }
  return component.versions.map((componentVersion) => {
    const page = contentCatalog.getById(Object.assign({ version: componentVersion.version }, basePageId))
    // QUESTION should title be title of component or page?
    return Object.assign(
      componentVersion === component.latest ? { latest: true } : {},
      componentVersion,
      page ? { url: page.pub.url } : { missing: true }
    )
  })
}

module.exports = createPageComposer
module.exports.buildSiteUiModel = buildSiteUiModel
module.exports.buildPageUiModel = buildPageUiModel
module.exports.buildUiModel = buildUiModel
