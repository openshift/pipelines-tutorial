const { homedir } = require('os')
const expandPath = require('@antora/expand-path-helper')
const fs = require('fs-extra')
const ospath = require('path')
const { URL } = require('url')

class GitCredentialManagerStore {
  configure ({ config, startDir }) {
    this.entries = undefined
    this.urls = {}
    if ((this.contents = (config = config || {}).contents)) {
      this.path = undefined
    } else {
      const path = config.path
      this.path = path ? expandPath(path, '~+', startDir) : undefined
    }
  }

  async load () {
    if (this.entries) return this.entries
    return (this.entries = new Promise(async (resolve) => {
      let contents = this.contents
      let delimiter
      if (contents) {
        delimiter = /[,\n]/
      } else {
        delimiter = '\n'
        let path = this.path || ospath.join(homedir(), '.git-credentials')
        contents = await fs.pathExists(path).then((exists) => {
          if (exists) {
            return fs.readFile(path, 'utf-8')
          } else {
            const xdgConfigHome = process.env.XDG_CONFIG_HOME || ospath.join(homedir(), '.config')
            path = ospath.join(xdgConfigHome, 'git', 'credentials')
            return fs
              .pathExists(path)
              .then((fallbackExists) => (fallbackExists ? fs.readFile(path, 'utf-8') : undefined))
          }
        })
        if (!contents) return resolve({})
      }
      resolve(
        contents
          .trim()
          .split(delimiter)
          .reduce((accum, url) => {
            try {
              const { username, password, hostname, pathname } = new URL(url)
              const credentials = password ? { username, password } : username ? { token: username } : undefined
              if (!credentials) return accum
              if (pathname === '/') {
                accum[hostname] = credentials
              } else {
                accum[hostname + pathname] = credentials
                if (!pathname.endsWith('.git')) accum[hostname + pathname + '.git'] = credentials
              }
            } catch (e) {}
            return accum
          }, {})
      )
    }))
  }

  async fill ({ url }) {
    this.urls[url] = 'requested'
    return this.load().then((entries) => {
      if (!Object.keys(entries).length) return
      const { hostname, pathname } = new URL(url)
      return entries[hostname + pathname] || entries[hostname]
    })
  }

  async approved ({ url }) {
    this.urls[url] = 'approved'
  }

  async rejected ({ url, auth }) {
    this.urls[url] = 'rejected'
    const statusCode = 401
    const statusMessage = 'HTTP Basic: Access Denied'
    const err = new Error(`HTTP Error: ${statusCode} ${statusMessage}`)
    err.name = err.code = 'HTTPError'
    err.data = { statusCode, statusMessage }
    if (auth) err.rejected = true
    throw err
  }

  status ({ url }) {
    return this.urls[url]
  }
}

module.exports = GitCredentialManagerStore
