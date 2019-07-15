'use strict'

const ContentCatalog = require('./content-catalog')

const { START_PAGE_ID } = require('./constants')

/**
 * Organizes the raw aggregate of virtual files into a {ContentCatalog}.
 *
 * @memberof content-classifier
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.site - Site-related configuration data.
 * @param {String} playbook.site.startPage - The start page for the site; redirects from base URL.
 * @param {Object} playbook.urls - URL settings for the site.
 * @param {String} playbook.urls.htmlExtensionStyle - The style to use when computing page URLs.
 * @param {Object} aggregate - The raw aggregate of virtual file objects to be classified.
 * @returns {ContentCatalog} A structured catalog of content components and virtual content files.
 */
function classifyContent (playbook, aggregate) {
  const contentCatalog = aggregate.reduce(
    (accum, { name, version, display_version: displayVersion, prerelease, title, start_page: startAt, nav, files }) => {
      files.forEach((file) => allocateSrc(file, name, version, nav) && accum.addFile(file))
      accum.registerComponentVersion(name, version, { displayVersion, title, prerelease, startPage: startAt })
      return accum
    },
    new ContentCatalog(playbook)
  )
  registerSiteStartPage(playbook, contentCatalog)
  return contentCatalog
}

function allocateSrc (file, component, version, nav) {
  const filepath = file.path
  const pathSegments = filepath.split('/')
  const navInfo = nav && getNavInfo(filepath, nav)
  if (navInfo) {
    file.nav = navInfo
    file.src.family = 'nav'
    if (pathSegments[0] === 'modules' && pathSegments.length > 2) {
      file.src.module = pathSegments[1]
      // relative to modules/<module>
      file.src.relative = pathSegments.slice(2).join('/')
      file.src.moduleRootPath = calculateRootPath(pathSegments.length - 3)
    } else {
      // relative to root
      file.src.relative = filepath
    }
  } else if (pathSegments[0] === 'modules') {
    switch (pathSegments[2]) {
      case 'pages':
        if (pathSegments[3] === '_partials') {
          file.src.family = 'partial'
          // relative to modules/<module>/pages/_partials; deprecated (in the future, warn)
          file.src.relative = pathSegments.slice(4).join('/')
          break
        } else if (file.src.mediaType === 'text/asciidoc') {
          file.src.family = 'page'
          // relative to modules/<module>/pages
          file.src.relative = pathSegments.slice(3).join('/')
          break
        }
        return
      case 'assets':
        if (pathSegments[3] === 'images') {
          file.src.family = 'image'
          // relative to modules/<module>/assets/images
          file.src.relative = pathSegments.slice(4).join('/')
          break
        } else if (pathSegments[3] === 'attachments') {
          file.src.family = 'attachment'
          // relative to modules/<module>/assets/attachments
          file.src.relative = pathSegments.slice(4).join('/')
          break
        }
        return
      case 'examples':
        file.src.family = 'example'
        // relative to modules/<module>/examples
        file.src.relative = pathSegments.slice(3).join('/')
        break
      case 'partials':
        file.src.family = 'partial'
        // relative to modules/<module>/partials
        file.src.relative = pathSegments.slice(3).join('/')
        break
      default:
        return
    }
    file.src.module = pathSegments[1]
    file.src.moduleRootPath = calculateRootPath(pathSegments.length - 3)
  } else {
    return
  }

  file.src.component = component
  file.src.version = version
  return true
}

/**
 * Return navigation properties if this file is registered as a navigation file.
 *
 * @param {String} filepath - The path of the virtual file to match.
 * @param {Array} nav - The array of navigation entries from the component descriptor.
 *
 * @returns {Object} An object of properties, which includes the navigation
 * index, if this file is a navigation file, or undefined if it's not.
 */
function getNavInfo (filepath, nav) {
  const index = nav.findIndex((candidate) => candidate === filepath)
  if (~index) return { index }
}

function registerSiteStartPage (playbook, contentCatalog) {
  const pageSpec = playbook.site.startPage
  if (!pageSpec) return
  const rel = contentCatalog.resolvePage(pageSpec)
  if (!rel) throw new Error('Specified start page for site not found: ' + pageSpec)
  const src = Object.assign({}, START_PAGE_ID, {
    family: 'alias',
    basename: 'index.adoc',
    stem: 'index',
    mediaType: 'text/asciidoc',
  })
  contentCatalog.addFile({ src, rel })
}

function calculateRootPath (depth) {
  return depth
    ? Array(depth)
      .fill('..')
      .join('/')
    : '.'
}

module.exports = classifyContent
