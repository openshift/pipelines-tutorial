'use strict'

module.exports = {
  playbook: {
    doc: 'Location of the playbook file.',
    format: String,
    default: undefined,
    arg: 'playbook',
  },
  site: {
    start_page: {
      doc: 'The start page for the site, redirected from the site index.',
      format: String,
      default: undefined,
      arg: 'start-page',
    },
    title: {
      doc: 'The title of the site.',
      format: String,
      default: undefined,
      arg: 'title',
    },
    url: {
      doc: 'The base URL of the published site. Should not include trailing slash.',
      format: String,
      default: undefined,
      arg: 'url',
      env: 'URL',
    },
    //root: {
    //  doc: 'The name of the component to use as the root of the site.',
    //  format: String,
    //  default: undefined,
    //},
    //aspect: {
    //  doc: 'The name of the aspect navigation to make available on every page in the site.',
    //  format: String,
    //  default: undefined,
    //},
    //nav: {
    //  doc: 'The list of descriptors which define the aspect navigation domains.',
    //  format: Array,
    //  default: undefined,
    //},
    keys: {
      google_analytics: {
        doc: 'The Google Analytics account key.',
        format: String,
        default: undefined,
        arg: 'google-analytics-key',
        env: 'GOOGLE_ANALYTICS_KEY',
      },
      //swiftype: {
      //  doc: 'The key to activate the Swiftype widget.',
      //  format: String,
      //  default: undefined,
      //  arg: 'swiftype-key',
      //},
    },
  },
  content: {
    branches: {
      doc: 'The default branch pattern to use when no specific pattern is provided.',
      format: Array,
      default: ['v*', 'master'],
    },
    sources: {
      doc: 'The list of git repositories + branch patterns to use.',
      format: Array,
      default: [],
    },
    tags: {
      doc: 'The default tag pattern to use when no specific pattern is provided',
      format: Array,
      default: undefined,
    },
  },
  ui: {
    bundle: {
      url: {
        doc: 'The URL of the UI bundle. Can be a path on the local filesystem.',
        format: String,
        arg: 'ui-bundle-url',
        default: null,
      },
      snapshot: {
        doc: 'Whether the bundle URL points to a snapshot that changes over time.',
        format: Boolean,
        default: false,
      },
      start_path: {
        doc: 'The relative path inside the bundle from which to start reading files.',
        format: String,
        default: '',
      },
    },
    output_dir: {
      doc: 'The output directory path relative to the site root where the UI files should be written.',
      format: String,
      default: '_',
    },
    default_layout: {
      doc: 'The default layout to apply to pages that do not specify a layout.',
      format: String,
      default: undefined,
    },
    supplemental_files: {
      doc: 'Supplemental file list or a directory of files to append to the UI bundle.',
      format: 'dir-or-virtual-files',
      default: undefined,
    },
  },
  asciidoc: {
    attributes: {
      doc: 'A document attribute to set on each page. May be specified multiple times.',
      format: 'map',
      default: {},
      arg: 'attribute',
    },
    extensions: {
      doc: 'A list of require paths for registering extensions per instance of the AsciiDoc processor.',
      format: Array,
      default: [],
      //arg: 'extension',
    },
  },
  git: {
    credentials: {
      path: {
        doc: 'The path to a git credentials file matching the format used by git-credential-store.',
        format: String,
        default: undefined,
        arg: 'git-credentials-path',
        env: 'GIT_CREDENTIALS_PATH',
      },
      contents: {
        doc: 'The git credentials data matching the format used by git-credentials-store (optionally comma-separated).',
        format: String,
        default: undefined,
        env: 'GIT_CREDENTIALS',
      },
    },
  },
  runtime: {
    cache_dir: {
      doc: 'The cache directory. (default: antora folder under cache dir for current user)',
      format: String,
      default: undefined,
      arg: 'cache-dir',
      env: 'ANTORA_CACHE_DIR',
    },
    fetch: {
      doc: 'Download updates from remote resources (including content repositories and UI bundle).',
      format: Boolean,
      default: false,
      arg: 'fetch',
    },
    pull: {
      doc: '(Deprecated) Download updates from remote resources. Use --fetch instead.',
      format: Boolean,
      default: undefined,
      arg: 'pull',
    },
    quiet: {
      doc: 'Do not write any messages to stdout.',
      format: Boolean,
      default: false,
      arg: 'quiet',
    },
    silent: {
      doc: 'Suppress all messages.',
      format: Boolean,
      default: false,
      arg: 'silent',
    },
  },
  urls: {
    html_extension_style: {
      doc: 'The user-facing URL extension to use for HTML pages.',
      format: ['default', 'drop', 'indexify'],
      default: 'default',
      arg: 'html-url-extension-style',
    },
    redirect_facility: {
      doc: 'The facility for handling page alias and start page redirections.',
      format: ['disabled', 'netlify', 'nginx', 'static'],
      default: 'static',
      arg: 'redirect-facility',
    },
  },
  output: {
    clean: {
      doc: 'Remove destination path before publishing (fs only).',
      format: Boolean,
      default: false,
      arg: 'clean',
    },
    dir: {
      doc: 'The directory where the site should be published. (default: build/site)',
      format: String,
      default: undefined,
      arg: 'to-dir',
    },
    destinations: {
      doc: 'A list of destinations where the generated site should be published.',
      format: Array,
      default: undefined,
    },
  },
}
