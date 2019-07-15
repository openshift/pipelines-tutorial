'use strict'

const camelCaseKeys = require('camelcase-keys')
const convict = require('./solitary-convict')
const deepFreeze = require('deep-freeze')
const fs = require('fs')
const ospath = require('path')

/**
 * Builds a playbook object according to the provided schema from the specified
 * arguments and environment variables.
 *
 * Accepts an array of command line arguments (in the form of option flags and
 * switches) and a map of environment variables and translates this data into a
 * playbook object according the the specified schema. If no schema is
 * specified, the default schema provided by this package is used.
 *
 * @memberof playbook-builder
 *
 * @param {Array} [args=[]] - An array of arguments in the form of command line
 *   option flags and switches. Should begin with the first flag or switch.
 * @param {Object} [env={}] - A map of environment variables.
 * @param {Object} [schema=undefined] - A convict configuration schema.
 *
 * @returns {Object} A playbook object containing a hierarchical structure that
 *   mirrors the configuration schema. Keys in the playbook are camelCased.
 */
function buildPlaybook (args = [], env = {}, schema = undefined) {
  const config = loadConvictConfig(args, env, schema)

  const relSpecFilePath = config.get('playbook')
  if (relSpecFilePath) {
    let absSpecFilePath = ospath.resolve(relSpecFilePath)
    if (ospath.extname(absSpecFilePath)) {
      if (!fs.existsSync(absSpecFilePath)) throw new Error('playbook file does not exist')
    } else if (fs.existsSync(absSpecFilePath + '.yml')) {
      absSpecFilePath += '.yml'
    } else if (fs.existsSync(absSpecFilePath + '.json')) {
      absSpecFilePath += '.json'
    } else if (fs.existsSync(absSpecFilePath + '.toml')) {
      absSpecFilePath += '.toml'
    } else {
      throw new Error('playbook file could not be resolved')
    }
    config.loadFile(absSpecFilePath)
    if (relSpecFilePath !== absSpecFilePath) config.set('playbook', absSpecFilePath)
  }

  config.validate({ allowed: 'strict' })

  return exportModel(config)
}

function loadConvictConfig (args, env, customSchema) {
  return convict(customSchema || require('./config/schema'), { args, env })
}

function exportModel (config) {
  const properties = config.getProperties()
  // FIXME would be nice if camelCaseKeys could exclude a subtree (e.g., asciidoc)
  // see https://github.com/sindresorhus/camelcase-keys/issues/23
  const asciidocProperty = properties.asciidoc
  delete properties.asciidoc
  const playbook = camelCaseKeys(properties, { deep: true })
  if (asciidocProperty) playbook.asciidoc = asciidocProperty
  const runtime = playbook.runtime
  if (runtime && runtime.pull != null) {
    runtime.fetch = runtime.pull
    delete runtime.pull
  }
  playbook.dir = playbook.playbook ? ospath.dirname((playbook.file = playbook.playbook)) : process.cwd()
  delete playbook.playbook
  return deepFreeze(playbook)
}

module.exports = buildPlaybook
