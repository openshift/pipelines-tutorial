'use strict'

const camelCaseKeys = require('camelcase-keys')
const collectBuffer = require('bl')
const { createHash } = require('crypto')
const expandPath = require('@antora/expand-path-helper')
const File = require('./file')
const fs = require('fs-extra')
const get = require('got')
const getCacheDir = require('cache-directory')
const { obj: map } = require('through2')
const minimatchAll = require('minimatch-all')
const ospath = require('path')
const { posix: path } = ospath
const posixify = ospath.sep === '\\' ? (p) => p.replace(/\\/g, '/') : undefined
const UiCatalog = require('./ui-catalog')
const yaml = require('js-yaml')
const vfs = require('vinyl-fs')
const vzip = require('gulp-vinyl-zip')

const { UI_CACHE_FOLDER, UI_DESC_FILENAME, SUPPLEMENTAL_FILES_GLOB } = require('./constants')
const URI_SCHEME_RX = /^https?:\/\//
const EXT_RX = /\.[a-z]{2,3}$/

/**
 * Loads the files in the specified UI bundle (zip archive) into a UiCatalog,
 * first downloading the bundle if necessary.
 *
 * Looks for UI bundle at the path specified in the ui.bundle.url property of
 * the playbook. If the path is a URI, it downloads the file and caches it at a
 * unique path to avoid this step in future calls. It then reads all the files
 * from the bundle into memory, skipping any files that fall outside of the
 * start path specified in the ui.startPath property of the playbook.  Finally,
 * it classifies the files and adds them to a UiCatalog, which is then
 * returned.
 *
 * @memberof ui-loader
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.dir - The working directory of the playbook.
 * @param {Object} playbook.runtime - The runtime configuration object for Antora.
 * @param {String} [playbook.runtime.cacheDir=undefined] - The base cache directory.
 * @param {Object} playbook.ui - The UI configuration object for Antora.
 * @param {String} playbook.ui.bundle - The UI bundle configuration.
 * @param {String} playbook.ui.bundle.url - The path (relative or absolute) or URI
 * of the UI bundle to use.
 * @param {String} [playbook.ui.bundle.startPath=''] - The path inside the bundle from
 * which to start reading files.
 * @param {String} [playbook.ui.outputDir='_'] - The path relative to the site root
 * where the UI files should be published.
 *
 * @returns {UiCatalog} A catalog of UI files which were read from the bundle.
 */
async function loadUi (playbook) {
  const startDir = playbook.dir || '.'
  const { bundle, supplementalFiles: supplementalFilesSpec, outputDir } = playbook.ui
  const bundleUrl = bundle.url
  let resolveBundle
  if (isUrl(bundleUrl)) {
    const { cacheDir, fetch } = playbook.runtime || {}
    resolveBundle = ensureCacheDir(cacheDir, startDir).then((absCacheDir) => {
      const cachePath = ospath.join(absCacheDir, `${sha1(bundleUrl)}.zip`)
      return fetch && bundle.snapshot
        ? downloadBundle(bundleUrl, cachePath)
        : fs.pathExists(cachePath).then((cached) => (cached ? cachePath : downloadBundle(bundleUrl, cachePath)))
    })
  } else {
    const localPath = expandPath(bundleUrl, '~+', startDir)
    resolveBundle = fs.pathExists(localPath).then((exists) => {
      if (exists) {
        return localPath
      } else {
        throw new Error('Specified UI bundle does not exist: ' + bundleUrl)
      }
    })
  }

  const files = await Promise.all([
    resolveBundle.then(
      (bundlePath) =>
        new Promise((resolve, reject) => {
          vzip
            .src(bundlePath)
            .on('error', reject)
            .pipe(selectFilesStartingFrom(bundle.startPath))
            .pipe(bufferizeContents())
            .on('error', reject)
            .pipe(collectFiles(resolve))
        })
    ),
    srcSupplementalFiles(supplementalFilesSpec, startDir),
  ]).then(([bundleFiles, supplementalFiles]) => mergeFiles(bundleFiles, supplementalFiles))

  const config = loadConfig(files, outputDir)

  const catalog = new UiCatalog()
  files.forEach((file) => catalog.addFile(classifyFile(file, config)))
  return catalog
}

function isUrl (string) {
  return ~string.indexOf('://') && URI_SCHEME_RX.test(string)
}

function sha1 (string) {
  const shasum = createHash('sha1')
  shasum.update(string)
  return shasum.digest('hex')
}

/**
 * Resolves the content cache directory and ensures it exists.
 *
 * @param {String} customCacheDir - The custom base cache directory. If the value is undefined,
 *   the user's cache folder is used.
 * @param {String} startDir - The directory from which to resolve a leading '.' segment.
 *
 * @returns {Promise<String>} A promise that resolves to the absolute ui cache directory.
 */
function ensureCacheDir (customCacheDir, startDir) {
  // QUESTION should fallback directory be relative to cwd, playbook dir, or tmpdir?
  const baseCacheDir =
    customCacheDir == null
      ? getCacheDir('antora' + (process.env.NODE_ENV === 'test' ? '-test' : '')) || ospath.resolve('.antora/cache')
      : expandPath(customCacheDir, '~+', startDir)
  const cacheDir = ospath.join(baseCacheDir, UI_CACHE_FOLDER)
  return fs.ensureDir(cacheDir).then(() => cacheDir)
}

function downloadBundle (url, to) {
  return get(url, { encoding: null }).then(({ body }) => fs.outputFile(to, body).then(() => to))
}

function selectFilesStartingFrom (startPath) {
  if (!startPath || (startPath = path.join('/', startPath + '/')) === '/') {
    return map((file, _, next) => {
      if (file.isNull()) {
        next()
      } else {
        next(
          null,
          new File({ path: posixify ? posixify(file.path) : file.path, contents: file.contents, stat: file.stat })
        )
      }
    })
  } else {
    startPath = startPath.substr(1)
    const startPathOffset = startPath.length
    return map((file, _, next) => {
      if (file.isNull()) {
        next()
      } else {
        const path_ = posixify ? posixify(file.path) : file.path
        if (path_.length > startPathOffset && path_.startsWith(startPath)) {
          next(null, new File({ path: path_.substr(startPathOffset), contents: file.contents, stat: file.stat }))
        } else {
          next()
        }
      }
    })
  }
}

function bufferizeContents () {
  return map((file, _, next) => {
    // NOTE gulp-vinyl-zip automatically converts the contents of an empty file to a Buffer
    if (file.isStream()) {
      file.contents.pipe(
        collectBuffer((err, data) => {
          if (err) return next(err)
          file.contents = data
          next(null, file)
        })
      )
    } else {
      next(null, file)
    }
  })
}

function collectFiles (done) {
  const files = new Map()
  return map((file, _, next) => files.set(file.path, file) && next(), () => done(files))
}

function srcSupplementalFiles (filesSpec, startDir) {
  if (!filesSpec) {
    return new Map()
  } else if (Array.isArray(filesSpec)) {
    return Promise.all(
      filesSpec.reduce((accum, { path: path_, contents: contents_ }) => {
        if (!path_) {
          return accum
        } else if (contents_) {
          if (~contents_.indexOf('\n') || !EXT_RX.test(contents_)) {
            accum.push(createMemoryFile(path_, contents_))
          } else {
            contents_ = expandPath(contents_, '~+', startDir)
            accum.push(
              fs
                .stat(contents_)
                .then((stat) => fs.readFile(contents_).then((contents) => new File({ path: path_, contents, stat })))
            )
          }
        } else {
          accum.push(createMemoryFile(path_))
        }
        return accum
      }, [])
    ).then((files) => files.reduce((accum, file) => accum.set(file.path, file) && accum, new Map()))
  } else {
    const base = expandPath(filesSpec, '~+', startDir)
    return fs
      .access(base)
      .then(
        () =>
          new Promise((resolve, reject) => {
            vfs
              .src(SUPPLEMENTAL_FILES_GLOB, { base, cwd: base, removeBOM: false })
              .on('error', reject)
              .pipe(relativizeFiles())
              .pipe(collectFiles(resolve))
          })
      )
      .catch((err) => {
        // Q: should we skip unreadable files?
        throw new Error('problem encountered while reading ui.supplemental_files: ' + err.message)
      })
  }
}

function createMemoryFile (path_, contents = []) {
  const stat = new fs.Stats()
  stat.size = contents.length
  stat.mode = 33188
  return new File({ path: path_, contents: Buffer.from(contents), stat })
}

function relativizeFiles () {
  return map((file, _, next) => {
    if (file.isNull()) {
      next()
    } else {
      next(
        null,
        new File({ path: posixify ? posixify(file.relative) : file.relative, contents: file.contents, stat: file.stat })
      )
    }
  })
}

function mergeFiles (files, supplementalFiles) {
  if (supplementalFiles.size) supplementalFiles.forEach((file) => files.set(file.path, file))
  return files
}

function loadConfig (files, outputDir) {
  const configFile = files.get(UI_DESC_FILENAME)
  if (configFile) {
    files.delete(UI_DESC_FILENAME)
    const config = camelCaseKeys(yaml.safeLoad(configFile.contents.toString()), { deep: true })
    if (outputDir !== undefined) config.outputDir = outputDir
    const staticFiles = config.staticFiles
    if (staticFiles) {
      if (!Array.isArray(staticFiles)) {
        config.staticFiles = [staticFiles]
      } else if (staticFiles.length === 0) {
        delete config.staticFiles
      }
    }
    return config
  } else {
    return { outputDir }
  }
}

function classifyFile (file, config) {
  if (config.staticFiles && isStaticFile(file, config.staticFiles)) {
    file.type = 'static'
    file.out = resolveOut(file, '')
  } else {
    file.type = resolveType(file)
    if (file.type === 'asset') {
      file.out = resolveOut(file, config.outputDir)
    }
  }
  return file
}

function isStaticFile (file, staticFiles) {
  return minimatchAll(file.path, staticFiles)
}

function resolveType (file) {
  const firstPathSegment = file.path.split('/', 1)[0]
  if (firstPathSegment === 'layouts') {
    return 'layout'
  } else if (firstPathSegment === 'helpers') {
    return 'helper'
  } else if (firstPathSegment === 'partials') {
    return 'partial'
  } else {
    return 'asset'
  }
}

function resolveOut (file, outputDir = '_') {
  let dirname = path.join(outputDir, file.dirname)
  if (dirname.charAt() === '/') dirname = dirname.substr(1)
  const basename = file.basename
  return { dirname, basename, path: path.join(dirname, basename) }
}

module.exports = loadUi
