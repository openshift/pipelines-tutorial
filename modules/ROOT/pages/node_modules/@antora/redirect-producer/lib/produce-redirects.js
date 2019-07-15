'use strict'

const computeRelativeUrlPath = require('@antora/asciidoc-loader/lib/util/compute-relative-url-path')
const File = require('vinyl')
const { URL } = require('url')

/**
 * Produces redirects (HTTP redirections) for registered page aliases.
 *
 * Iterates over files in the alias family from the content catalog and creates artifacts that
 * handle redirects from the URL of each alias to the target URL. The artifact that is created
 * depends on the redirect facility in use. If the redirect facility is static (the default), this
 * function populates the contents of the alias file with an HTML redirect page (i.e., bounce page).
 * If the redirect facility is nginx, this function creates and returns an nginx configuration file
 * that contains rewrite rules for each alias. If the redirect facility is disabled, this function
 * unpublishes the alias files by removing the out property on each alias file.
 *
 * @memberof redirect-producer
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.site - Site-related configuration data.
 * @param {String} playbook.site.url - The base URL of the site.
 * @param {String} playbook.urls - URL-related configuration data.
 * @param {String} playbook.urls.redirectFacility - The redirect facility for
 *   which redirect configuration is being produced.
 * @param {ContentCatalog} contentCatalog - The content catalog that provides
 *   access to the virtual content files (i.e., pages) in the site.
 * @returns {Array<File>} An array of File objects that contain rewrite configuration for the web server.
 */
function produceRedirects (playbook, contentCatalog) {
  const aliases = contentCatalog.findBy({ family: 'alias' })
  if (!aliases.length) return []
  let siteUrl = playbook.site.url
  switch (playbook.urls.redirectFacility) {
    case 'static':
      if (siteUrl && siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
      return populateStaticRedirectFiles(aliases, siteUrl)
    case 'netlify':
      return createNetlifyRedirects(
        aliases,
        extractUrlContext(siteUrl),
        (playbook.urls.htmlExtensionStyle || 'default') === 'default'
      )
    case 'nginx':
      return createNginxRewriteConf(aliases, extractUrlContext(siteUrl))
    default:
      return unpublish(aliases)
  }
}

function extractUrlContext (sourceUrl) {
  let urlContext
  return sourceUrl && (urlContext = new URL(sourceUrl).pathname) !== '/' ? urlContext : undefined
}

function populateStaticRedirectFiles (files, siteUrl) {
  files.forEach((file) => {
    file.contents = createStaticRedirectContents(file, siteUrl)
    file.mediaType = 'text/html'
  })
  return []
}

function createNetlifyRedirects (files, urlContext = '', includeDirectoryRedirects = false) {
  const rules = files.reduce((accum, file) => {
    delete file.out
    accum.push(`${urlContext}${file.pub.url} ${urlContext}${file.rel.pub.url} 301`)
    if (includeDirectoryRedirects && file.pub.url.endsWith('/index.html')) {
      accum.push(`${urlContext}${file.pub.url.slice(0, -10)} ${urlContext}${file.rel.pub.url} 301`)
    }
    return accum
  }, [])
  const redirectsFile = new File({
    contents: Buffer.from(rules.join('\n')),
    out: { path: '_redirects' },
  })
  return [redirectsFile]
}

function createNginxRewriteConf (files, urlContext = '') {
  const rules = files.map((file) => {
    delete file.out
    return `location = ${urlContext}${file.pub.url} { return 301 ${urlContext}${file.rel.pub.url}; }`
  })
  const rewriteConfigFile = new File({
    contents: Buffer.from(rules.join('\n')),
    out: { path: '.etc/nginx/rewrite.conf' },
  })
  return [rewriteConfigFile]
}

function unpublish (files) {
  files.forEach((file) => delete file.out)
  return []
}

function createStaticRedirectContents (file, siteUrl) {
  const targetUrl = file.rel.pub.url
  const relativeUrl = computeRelativeUrlPath(file.pub.url, targetUrl)
  const canonicalUrl = siteUrl ? siteUrl + targetUrl : undefined
  const canonicalLink = siteUrl ? `\n<link rel="canonical" href="${canonicalUrl}">` : ''
  return Buffer.from(`<!DOCTYPE html>
<meta charset="utf-8">${canonicalLink}
<script>location="${relativeUrl}"</script>
<meta http-equiv="refresh" content="0; url=${relativeUrl}">
<meta name="robots" content="noindex">
<title>Redirect Notice</title>
<h1>Redirect Notice</h1>
<p>The page you requested has been relocated to <a href="${relativeUrl}">${canonicalUrl || relativeUrl}</a>.</p>`)
}

module.exports = produceRedirects
