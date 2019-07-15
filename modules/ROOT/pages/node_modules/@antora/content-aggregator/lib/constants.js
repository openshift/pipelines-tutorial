'use strict'

module.exports = Object.freeze({
  COMPONENT_DESC_FILENAME: 'antora.yml',
  // QUESTION should the cache version track the major version of Antora?
  CONTENT_CACHE_FOLDER: 'content/2',
  CONTENT_GLOB: '**/*.*',
  // NOTE ignoring 120000 (symlink)
  FILE_MODES: { '100644': 0o100666 & ~process.umask(), '100755': 0o100777 & ~process.umask() },
  GIT_CORE: 'antora',
  GIT_OPERATION_LABEL_LENGTH: 8,
  GIT_PROGRESS_PHASES: ['Counting objects', 'Compressing objects', 'Receiving objects', 'Resolving deltas'],
})
