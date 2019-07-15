'use strict'

const _ = require('lodash')
const { createHash } = require('crypto')
const EventEmitter = require('events')
const expandPath = require('@antora/expand-path-helper')
const File = require('./file')
const fs = require('fs-extra')
const getCacheDir = require('cache-directory')
const GitCredentialManagerStore = require('./git-credential-manager-store')
const git = require('isomorphic-git')
const { obj: map } = require('through2')
const matcher = require('matcher')
const mimeTypes = require('./mime-types-with-asciidoc')
const MultiProgress = require('multi-progress')
const ospath = require('path')
const { posix: path } = ospath
const posixify = ospath.sep === '\\' ? (p) => p.replace(/\\/g, '/') : undefined
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const {
  COMPONENT_DESC_FILENAME,
  CONTENT_CACHE_FOLDER,
  CONTENT_GLOB,
  FILE_MODES,
  GIT_CORE,
  GIT_OPERATION_LABEL_LENGTH,
  GIT_PROGRESS_PHASES,
} = require('./constants')

const ABBREVIATE_REF_RX = /^refs\/(?:heads|remotes\/[^/]+|tags)\//
const ANY_SEPARATOR_RX = /[:/]/
const CSV_RX = /\s*,\s*/
const GIT_URI_DETECTOR_RX = /:(?:\/\/|[^/\\])/
const HOSTED_GIT_REPO_RX = /(github\.com|gitlab\.com|bitbucket\.org|pagure\.io)[:/](.+?)(?:\.git)?$/
const NON_UNIQUE_URI_SUFFIX_RX = /(?:(?:(?:\.git)?\/)?\.git|\/)$/
const PERIPHERAL_SEPARATOR_RX = /^\/+|\/+$/g
const URL_AUTH_EXTRACTOR_RX = /^(https?:\/\/)(?:([^/:@]+)(?::([^/@]+))?@)?(.*)/

/**
 * Aggregates files from the specified content sources so they can
 * be loaded into a virtual file catalog.
 *
 * Currently assumes each source points to a local or remote git repository.
 * Clones the repository, if necessary, then walks the git tree (or worktree)
 * of the specified branches and tags. Creates a virtual file containing the
 * source location and contents for each file matched. The files are then
 * organized by component version.
 *
 * @memberof content-aggregator
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.dir - The working directory of the playbook.
 * @param {Object} playbook.runtime - The runtime configuration object for Antora.
 * @param {String} [playbook.runtime.cacheDir=undefined] - The base cache directory.
 * @param {Array} playbook.content - An array of content sources.
 *
 * @returns {Promise<Object>} A map of files organized by component version.
 */
function aggregateContent (playbook) {
  const startDir = playbook.dir || '.'
  const { branches: defaultBranches, tags: defaultTags, sources } = playbook.content
  const sourcesByUrl = _.groupBy(sources, 'url')
  const { cacheDir, fetch, silent, quiet } = playbook.runtime
  const progress = !quiet && !silent && createProgress(sourcesByUrl, process.stdout)
  const credentialManager = registerGitPlugins((playbook.git || {}).credentials, startDir)
  return ensureCacheDir(cacheDir, startDir).then((resolvedCacheDir) =>
    Promise.all(
      Object.entries(sourcesByUrl).map(([url, sources]) =>
        loadRepository(url, {
          cacheDir: resolvedCacheDir,
          credentialManager,
          fetchTags: tagsSpecified(sources, defaultTags),
          progress,
          fetch,
          startDir,
        }).then(({ repo, authStatus }) =>
          Promise.all(
            sources.map((source) => {
              const refPatterns = { branches: source.branches || defaultBranches, tags: source.tags || defaultTags }
              // NOTE if repository is managed (has a url), we can assume the remote name is origin
              // TODO if the repo has no remotes, then remoteName should be undefined
              const remoteName = repo.url ? 'origin' : source.remote || 'origin'
              return collectComponentVersions(source, repo, remoteName, authStatus, refPatterns)
            })
          )
        )
      )
    )
      .then((accruedComponentVersions) => buildAggregate(accruedComponentVersions))
      .catch((err) => {
        progress && progress.terminate()
        throw err
      })
  )
}

function buildAggregate (componentVersions) {
  return _(componentVersions)
    .flattenDepth(2)
    .groupBy(({ name, version }) => version + '@' + name)
    .map((componentVersions, id) => {
      const component = _(componentVersions)
        .map((a) => _.omit(a, 'files'))
        .reduce((a, b) => _.assign(a, b), {})
      component.files = _(componentVersions)
        .map('files')
        .reduce((a, b) => a.concat(b), [])
      return component
    })
    .sortBy(['name', 'version'])
    .value()
}

async function loadRepository (url, opts) {
  let displayUrl
  let credentials
  let credentialManager
  let dir
  let repo
  let authStatus

  if (~url.indexOf(':') && GIT_URI_DETECTOR_RX.test(url)) {
    ;({ displayUrl, url, credentials } = extractCredentials(url))
    dir = ospath.join(opts.cacheDir, generateCloneFolderName(displayUrl))
    // NOTE if url is set on repo, we assume it's remote
    repo = { core: GIT_CORE, fs, dir, gitdir: dir, url, noCheckout: true }
    credentialManager = opts.credentialManager
  } else if (await isLocalDirectory((dir = expandPath(url, '~+', opts.startDir)))) {
    repo = (await isLocalDirectory(ospath.join(dir, '.git')))
      ? { core: GIT_CORE, fs, dir }
      : { core: GIT_CORE, fs, dir, gitdir: dir, noCheckout: true }
  } else {
    throw new Error(
      `Local content source does not exist: ${dir}${url !== dir ? ' (resolved from url: ' + url + ')' : ''}`
    )
  }

  // QUESTION should we capture the current branch in repo object here?

  try {
    // NOTE attempt to resolve HEAD to determine whether dir is a valid git repo
    // QUESTION should we also check for shallow file?
    await git.resolveRef(Object.assign({ ref: 'HEAD', depth: 1 }, repo))
    if (repo.url) {
      if (opts.fetch) {
        const fetchOpts = getFetchOptions(repo, opts.progress, displayUrl, credentials, opts.fetchTags, 'fetch')
        await git
          .fetch(fetchOpts)
          .then(() => {
            authStatus = credentials ? 'auth-embedded' : credentialManager.status({ url }) ? 'auth-required' : undefined
            return git.config(Object.assign({ path: 'remote.origin.private', value: authStatus }, repo))
          })
          .catch((fetchErr) => {
            fetchOpts.emitter && fetchOpts.emitter.emit('error', fetchErr)
            if (fetchErr.name === git.E.HTTPError && fetchErr.data.statusCode === 401) fetchErr.rethrow = true
            throw fetchErr
          })
          .then(() => fetchOpts.emitter && fetchOpts.emitter.emit('complete'))
      } else {
        // use cached value from previous fetch
        authStatus = await git.config(Object.assign({ path: 'remote.origin.private' }, repo))
      }
    }
  } catch (gitErr) {
    if (repo.url) {
      await fs.remove(dir)
      if (gitErr.rethrow) throw transformGitCloneError(gitErr, displayUrl)
      const fetchOpts = getFetchOptions(repo, opts.progress, displayUrl, credentials, opts.fetchTags, 'clone')
      await git
        .clone(fetchOpts)
        .then(() => {
          authStatus = credentials ? 'auth-embedded' : credentialManager.status({ url }) ? 'auth-required' : undefined
          return git.config(Object.assign({ path: 'remote.origin.private', value: authStatus }, repo))
        })
        .catch((cloneErr) => {
          // FIXME triggering the error handler here causes assertion problems in the test suite
          //fetchOpts.emitter && fetchOpts.emitter.emit('error', cloneErr)
          throw transformGitCloneError(cloneErr, displayUrl)
        })
        .then(() => fetchOpts.emitter && fetchOpts.emitter.emit('complete'))
    } else {
      throw new Error(
        `Local content source must be a git repository: ${dir}${url !== dir ? ' (resolved from url: ' + url + ')' : ''}`
      )
    }
  }
  return { repo, authStatus }
}

function extractCredentials (url) {
  if ((url.startsWith('https://') || url.startsWith('http://')) && ~url.indexOf('@')) {
    // Common oauth2 formats: (QUESTION should we try to coerce token only into one of these formats?)
    // GitHub: <token>:x-oauth-basic@ (or <token>@)
    // GitHub App: x-access-token:<token>@
    // GitLab: oauth2:<token>@
    // BitBucket: x-token-auth:<token>@
    const [, scheme, username, password, rest] = url.match(URL_AUTH_EXTRACTOR_RX)
    const displayUrl = (url = scheme + rest)
    // NOTE if only username is present, assume it's a GitHub token
    return { displayUrl, url, credentials: password == null ? { token: username } : { username, password } }
  } else if (url.startsWith('git@')) {
    return { displayUrl: url, url: 'https://' + url.substr(4).replace(':', '/') }
  } else {
    return { displayUrl: url, url }
  }
}

function collectComponentVersions (source, repo, remoteName, authStatus, refPatterns) {
  return selectReferences(repo, remoteName, refPatterns).then((refs) =>
    Promise.all(refs.map((ref) => populateComponentVersion(source, repo, remoteName, authStatus, ref)))
  )
}

// QUESTION should we resolve HEAD to a ref eagerly to avoid having to do a match on it?
async function selectReferences (repo, remote, refPatterns) {
  let { branches: branchPatterns, tags: tagPatterns } = refPatterns
  const isBare = repo.noCheckout
  const refs = new Map()

  if (tagPatterns) {
    tagPatterns = Array.isArray(tagPatterns)
      ? tagPatterns.map((pattern) => String(pattern))
      : String(tagPatterns).split(CSV_RX)
    if (tagPatterns.length) {
      const tags = await git.listTags(repo)
      for (let name of tags) {
        if (matcher([name], tagPatterns).length) {
          // NOTE tags are stored using symbol keys to distinguish them from branches
          refs.set(Symbol(name), { name, qname: 'tags/' + name, type: 'tag' })
        }
      }
    }
  }

  if (branchPatterns) {
    const branchPatternsString = String(branchPatterns)
    if (branchPatternsString === 'HEAD' || branchPatternsString === '.') {
      // NOTE current branch is undefined when HEAD is detached
      const currentBranchName = await getCurrentBranchName(repo, remote)
      if (currentBranchName) {
        branchPatterns = [currentBranchName]
      } else {
        if (!isBare) refs.set('HEAD', { name: 'HEAD', qname: 'HEAD', type: 'branch', isHead: true })
        return Array.from(refs.values())
      }
    } else {
      branchPatterns = Array.isArray(branchPatterns)
        ? branchPatterns.map((pattern) => String(pattern))
        : branchPatternsString.split(CSV_RX)
      if (branchPatterns.length) {
        let currentBranchIdx
        // NOTE we can assume at least two entries if HEAD or . are present
        if (~(currentBranchIdx = branchPatterns.indexOf('HEAD')) || ~(currentBranchIdx = branchPatterns.indexOf('.'))) {
          // NOTE current branch is undefined when HEAD is detached
          const currentBranchName = await getCurrentBranchName(repo, remote)
          if (currentBranchName) {
            branchPatterns[currentBranchIdx] = currentBranchName
          } else {
            if (!isBare) refs.set('HEAD', { name: 'HEAD', qname: 'HEAD', type: 'branch', isHead: true })
            branchPatterns.splice(currentBranchIdx, 1)
          }
        }
      } else {
        return Array.from(refs.values())
      }
    }
    const remoteBranches = await git.listBranches(Object.assign({ remote }, repo))
    for (let name of remoteBranches) {
      // NOTE isomorphic-git includes HEAD in list of remote branches (see https://isomorphic-git.org/docs/listBranches)
      if (name !== 'HEAD' && matcher([name], branchPatterns).length) {
        refs.set(name, { name, qname: path.join('remotes', remote, name), type: 'branch', remote })
      }
    }
    // NOTE only consider local branches if repo has a worktree or there are no remote tracking branches
    if (!isBare) {
      const localBranches = await git.listBranches(repo)
      if (localBranches.length) {
        const currentBranchName = await git.currentBranch(repo)
        for (let name of localBranches) {
          if (matcher([name], branchPatterns).length) {
            refs.set(name, { name, qname: name, type: 'branch', isHead: name === currentBranchName })
          }
        }
      }
    } else if (!remoteBranches.length) {
      const localBranches = await git.listBranches(repo)
      if (localBranches.length) {
        for (let name of localBranches) {
          if (matcher([name], branchPatterns).length) refs.set(name, { name, qname: name, type: 'branch' })
        }
      }
    }
  }

  return Array.from(refs.values())
}

function getCurrentBranchName (repo, remote) {
  let refPromise
  if (repo.noCheckout) {
    refPromise = git
      .resolveRef(Object.assign({ ref: `refs/remotes/${remote}/HEAD`, depth: 2 }, repo))
      .catch(() => git.resolveRef(Object.assign({ ref: 'HEAD', depth: 2 }, repo)))
  } else {
    refPromise = git.resolveRef(Object.assign({ ref: 'HEAD', depth: 2 }, repo))
  }
  return refPromise.then((ref) => (ref.startsWith('refs/') ? ref.replace(ABBREVIATE_REF_RX, '') : undefined))
}

async function populateComponentVersion (source, repo, remoteName, authStatus, ref) {
  const url = repo.url
  const originUrl = url || (await resolveRemoteUrl(repo, remoteName).then((url) => url || repo.dir))
  let startPath = source.startPath || ''
  if (startPath && ~startPath.indexOf('/')) startPath = startPath.replace(PERIPHERAL_SEPARATOR_RX, '')
  // Q: should worktreePath be passed in?
  const worktreePath = ref.isHead && !(url || repo.noCheckout) ? ospath.join(repo.dir, startPath) : undefined
  let files
  let componentVersion
  try {
    files = worktreePath
      ? await readFilesFromWorktree(worktreePath, startPath)
      : await readFilesFromGitTree(repo, ref, startPath)
    componentVersion = loadComponentDescriptor(files, startPath)
  } catch (err) {
    err.message += ` in ${url || repo.dir} [ref: ${ref.qname}${worktreePath ? ' <worktree>' : ''}]`
    throw err
  }
  const origin = computeOrigin(originUrl, authStatus, ref.name, ref.type, startPath, worktreePath)
  componentVersion.files = files.map((file) => assignFileProperties(file, origin))
  return componentVersion
}

function readFilesFromWorktree (base, startPath) {
  return fs
    .stat(base)
    .catch(() => {
      throw new Error(`the start path '${startPath}' does not exist`)
    })
    .then((stat) => {
      if (!stat.isDirectory()) throw new Error(`the start path '${startPath}' is not a directory`)
      return new Promise((resolve, reject) => {
        const opts = { base, cwd: base, removeBOM: false }
        vfs
          .src(CONTENT_GLOB, opts)
          .on('error', reject)
          .pipe(relativizeFiles())
          .pipe(collectFiles(resolve))
      })
    })
}

/**
 * Transforms the path of every file in the stream to a relative posix path.
 *
 * Applies a mapping function to all files in the stream so they end up with a
 * posixified path relative to the file's base instead of the filesystem root.
 * This mapper also filters out any directories (indicated by file.isNull())
 * that got caught up in the glob.
 */
function relativizeFiles () {
  return map((file, enc, next) => {
    if (file.isNull()) {
      next()
    } else {
      next(
        null,
        new File({
          path: posixify ? posixify(file.relative) : file.relative,
          contents: file.contents,
          stat: file.stat,
          src: { abspath: file.path },
        })
      )
    }
  })
}

function collectFiles (done) {
  const accum = []
  return map((file, enc, next) => accum.push(file) && next(), () => done(accum))
}

function readFilesFromGitTree (repo, ref, startPath) {
  return getGitTree(repo, ref, startPath).then((tree) => srcGitTree(repo, tree))
}

function getGitTree (repo, { qname: ref }, startPath) {
  // NOTE sometimes isomorphic-git takes two attempts resolve an annotated tag; perhaps something to address upstream
  return git
    .resolveRef(Object.assign({ ref }, repo))
    .then((oid) => git.readObject(Object.assign({ oid }, repo)))
    .then((entry) => (entry.type === 'tag' ? git.readObject(Object.assign({ oid: entry.object.object }, repo)) : entry))
    .then(({ object: commit }) =>
      git
        .readObject(Object.assign({ oid: commit.tree, filepath: startPath }, repo))
        .catch(() => {
          throw new Error(`the start path '${startPath}' does not exist`)
        })
        .then((entry) => {
          if (entry.type !== 'tree') throw new Error(`the start path '${startPath}' is not a directory`)
          return entry.object
        })
    )
}

function srcGitTree (repo, tree) {
  return new Promise((resolve, reject) => {
    const files = []
    walkGitTree(repo, tree, filterGitEntry)
      .on('entry', (entry) => files.push(entryToFile(entry)))
      .on('error', reject)
      .on('end', () => resolve(Promise.all(files)))
      .start()
  })
}

function walkGitTree (repo, root, filter) {
  const emitter = new EventEmitter()
  let depth = 1
  function visit (tree, dirname = '') {
    depth--
    for (let entry of tree.entries) {
      if (filter(entry)) {
        const type = entry.type
        if (type === 'blob') {
          const mode = FILE_MODES[entry.mode]
          if (mode) {
            emitter.emit(
              'entry',
              Object.assign({}, repo, { mode, oid: entry.oid, path: path.join(dirname, entry.path) })
            )
          }
        } else if (type === 'tree') {
          depth++
          git
            .readObject(Object.assign({ oid: entry.oid }, repo))
            .then(({ object: subtree }) => visit(subtree, path.join(dirname, entry.path)))
            .catch((err) => emitter.emit('error', err))
        }
      }
    }
    if (depth === 0) emitter.emit('end')
  }
  emitter.start = () => visit(root)
  return emitter
}

/**
 * Returns true if the entry should be processed or false if it should be skipped.
 */
function filterGitEntry (entry) {
  return !entry.path.startsWith('.') && (entry.type !== 'blob' || ~entry.path.indexOf('.'))
}

function entryToFile (entry) {
  return git.readObject(entry).then(({ object: contents }) => {
    const stat = new fs.Stats()
    stat.mode = entry.mode
    stat.size = contents.length
    return new File({ path: entry.path, contents, stat })
  })
}

function loadComponentDescriptor (files, startPath) {
  const descriptorFileIdx = files.findIndex((file) => file.path === COMPONENT_DESC_FILENAME)
  if (descriptorFileIdx < 0) throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' not found')
  const descriptorFile = files[descriptorFileIdx]
  files.splice(descriptorFileIdx, 1)
  const data = yaml.safeLoad(descriptorFile.contents.toString())
  if (data.name == null) {
    throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' is missing a name')
  } else if (data.version == null) {
    throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' is missing a version')
  }
  data.name = String(data.name)
  data.version = String(data.version)
  return data
}

function computeOrigin (url, authStatus, refName, refType, startPath, worktreePath = undefined) {
  let match
  const origin = { type: 'git', url, startPath }
  if (authStatus) origin.private = authStatus
  origin[refType] = refName
  if (worktreePath) {
    origin.editUrlPattern = 'file://' + (posixify ? '/' + posixify(worktreePath) : worktreePath) + '/%s'
    // Q: should we set worktreePath instead (or additionally?)
    origin.worktree = true
  } else if ((match = url.match(HOSTED_GIT_REPO_RX))) {
    const host = match[1]
    let action
    let category = ''
    if (host === 'pagure.io') {
      action = 'blob'
      category = 'f'
    } else if (host === 'bitbucket.org') {
      action = 'src'
    } else {
      action = refType === 'branch' ? 'edit' : 'blob'
    }
    origin.editUrlPattern = 'https://' + path.join(match[1], match[2], action, refName, category, startPath, '%s')
  }
  return origin
}

function assignFileProperties (file, origin) {
  const extname = file.extname
  file.mediaType = mimeTypes.lookup(extname)
  if (!file.src) file.src = {}
  Object.assign(file.src, {
    path: file.path,
    basename: file.basename,
    stem: file.stem,
    extname,
    mediaType: file.mediaType,
    origin,
  })
  if (origin.editUrlPattern) file.src.editUrl = origin.editUrlPattern.replace('%s', file.src.path)
  return file
}

function getFetchOptions (repo, progress, url, credentials, fetchTags, operation) {
  const opts = Object.assign({ depth: 1 }, credentials, repo)
  if (progress) opts.emitter = createProgressEmitter(progress, url, operation)
  if (operation === 'fetch') {
    if (fetchTags) opts.tags = true
  } else if (!fetchTags) {
    opts.noTags = true
  }
  return opts
}

function createProgress (sourcesByUrl, term) {
  if (term.isTTY && term.columns > 59) {
    //term.write('Aggregating content...\n')
    const progress = new MultiProgress(term)
    progress.maxLabelWidth = Math.min(
      // NOTE remove the width of the operation, then split the difference between the url and bar
      Math.ceil((term.columns - GIT_OPERATION_LABEL_LENGTH) / 2),
      Object.keys(sourcesByUrl).reduce(
        (max, url) =>
          Math.max(
            max,
            ~url.indexOf(':') && GIT_URI_DETECTOR_RX.test(url) ? extractCredentials(url).displayUrl.length : 0
          ),
        0
      )
    )
    return progress
  }
}

function createProgressEmitter (progress, progressLabel, operation) {
  const progressBar = progress.newBar(formatProgressBar(progressLabel, progress.maxLabelWidth, operation), {
    total: 100,
    complete: '#',
    incomplete: '-',
  })
  const ticks = progressBar.stream.columns - progressBar.fmt.replace(':bar', '').length
  // NOTE leave room for indeterminate progress at end of bar; this isn't strictly needed for a bare clone
  progressBar.scaleFactor = Math.max(0, (ticks - 1) / ticks)
  progressBar.tick(0)
  return new EventEmitter()
    .on('progress', onGitProgress.bind(null, progressBar))
    .on('complete', onGitComplete.bind(null, progressBar))
    .on('error', onGitComplete.bind(null, progressBar))
}

function formatProgressBar (label, maxLabelWidth, operation) {
  const paddingSize = maxLabelWidth - label.length
  let padding = ''
  if (paddingSize < 0) {
    label = '...' + label.substr(-paddingSize + 3)
  } else if (paddingSize) {
    padding = ' '.repeat(paddingSize)
  }
  // NOTE assume operation has a fixed length
  return `[${operation}] ${label}${padding} [:bar]`
}

function onGitProgress (progressBar, { phase, loaded, total }) {
  const phaseIdx = GIT_PROGRESS_PHASES.indexOf(phase)
  if (~phaseIdx) {
    const scaleFactor = progressBar.scaleFactor
    let ratio = ((loaded / total) * scaleFactor) / GIT_PROGRESS_PHASES.length
    if (phaseIdx) ratio += (phaseIdx * scaleFactor) / GIT_PROGRESS_PHASES.length
    // TODO if we upgrade to progress >= 2.0.0, UI updates are automatically throttled (set via renderThrottle option)
    //setTimeout(() => progressBar.update(ratio > scaleFactor ? scaleFactor : ratio), 0)
    progressBar.update(ratio > scaleFactor ? scaleFactor : ratio)
  }
}

function onGitComplete (progressBar, err) {
  if (err) {
    progressBar.chars.incomplete = '?'
    progressBar.update(0)
  } else {
    progressBar.update(1)
  }
}

/**
 * Generates a safe, unique folder name for a git URL.
 *
 * The purpose of this function is generate a safe, unique folder name for the cloned
 * repository that gets stored in the cache directory.
 *
 * The generated folder name follows the pattern: <basename>-<sha1>-<version>.git
 *
 * @param {String} url - The repository URL to convert.
 * @returns {String} The generated folder name.
 */
function generateCloneFolderName (url) {
  let normalizedUrl = url.toLowerCase()
  if (posixify) normalizedUrl = posixify(normalizedUrl)
  normalizedUrl = normalizedUrl.replace(NON_UNIQUE_URI_SUFFIX_RX, '')
  const basename = normalizedUrl.split(ANY_SEPARATOR_RX).pop()
  const hash = createHash('sha1')
  hash.update(normalizedUrl)
  return basename + '-' + hash.digest('hex') + '.git'
}

/**
 * Resolve the URL of the specified remote for the given repository.
 *
 * @param {Repository} repo - The repository on which to operate.
 * @param {String} remoteName - The name of the remote to resolve.
 * @returns {String} The URL of the specified remote, if present.
 */
async function resolveRemoteUrl (repo, remoteName) {
  return git.config(Object.assign({ path: 'remote.' + remoteName + '.url' }, repo))
}

/**
 * Checks whether the specified URL matches a directory on the local filesystem.
 *
 * @param {String} url - The URL to check.
 * @return {Boolean} A flag indicating whether the URL matches a directory on the local filesystem.
 */
function isLocalDirectory (url) {
  return fs
    .stat(url)
    .then((stat) => stat.isDirectory())
    .catch(() => false)
}

function tagsSpecified (sources, defaultTags) {
  return ~sources.findIndex((source) => {
    const tags = source.tags || defaultTags || []
    return Array.isArray(tags) ? tags.length : true
  })
}

function registerGitPlugins (config, startDir) {
  const plugins = git.cores.create(GIT_CORE)
  // QUESTION should fs be pluggable?
  //if (!plugins.has('fs')) plugins.set('fs', fs)
  let credentialManager
  if (plugins.has('credentialManager')) {
    credentialManager = plugins.get('credentialManager')
    if (typeof credentialManager.configure === 'function') credentialManager.configure({ config, startDir })
    if (typeof credentialManager.status !== 'function') {
      credentialManager = Object.assign({}, credentialManager, { status () {} })
    }
  } else {
    plugins.set('credentialManager', (credentialManager = new GitCredentialManagerStore()))
    credentialManager.configure({ config, startDir })
  }
  return credentialManager
}

/**
 * Expands the content cache directory path and ensures it exists.
 *
 * @param {String} preferredCacheDir - The preferred cache directory. If the value is undefined,
 *   the user's cache folder is used.
 * @param {String} startDir - The directory to use in place of a leading '.' segment.
 *
 * @returns {Promise<String>} A promise that resolves to the absolute content cache directory.
 */
function ensureCacheDir (preferredCacheDir, startDir) {
  // QUESTION should fallback directory be relative to cwd, playbook dir, or tmpdir?
  const baseCacheDir =
    preferredCacheDir == null
      ? getCacheDir('antora' + (process.env.NODE_ENV === 'test' ? '-test' : '')) || ospath.resolve('.antora/cache')
      : expandPath(preferredCacheDir, '~+', startDir)
  const cacheDir = ospath.join(baseCacheDir, CONTENT_CACHE_FOLDER)
  return fs.ensureDir(cacheDir).then(() => cacheDir)
}

function transformGitCloneError (err, displayUrl) {
  let msg
  const { code, data, message } = err
  if (code === git.E.HTTPError) {
    if (data.statusCode === 401) {
      if (err.rejected) {
        msg = 'Content repository not found or credentials were rejected'
      } else {
        msg = 'Content repository not found or requires credentials'
      }
    } else if (data.statusCode === 404) {
      msg = 'Content repository not found'
    } else {
      msg = message.replace(/[.:]?\s*$/, '')
    }
  } else if (code === git.E.RemoteUrlParseError || code === git.E.UnknownTransportError) {
    msg = 'Content source uses an unsupported transport protocol'
  } else {
    msg = message.replace(/[.:]?\s*$/, '')
  }
  return new Error(msg + ': ' + displayUrl)
}

module.exports = aggregateContent
module.exports._computeOrigin = computeOrigin
