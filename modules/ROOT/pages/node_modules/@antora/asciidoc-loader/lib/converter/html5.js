'use strict'

const Opal = global.Opal
const { $Antora } = require('../constants')
const $pageRefCallback = Symbol('callback')

const Html5Converter = (() => {
  const scope = Opal.klass(
    Opal.module(null, 'Antora', $Antora),
    Opal.module(null, 'Asciidoctor').Converter.Html5Converter,
    'Html5Converter',
    function () {}
  )
  Opal.defn(scope, '$initialize', function initialize (backend, opts, callbacks) {
    Opal.send(this, Opal.find_super_dispatcher(this, 'initialize', initialize), [backend, opts])
    this[$pageRefCallback] = callbacks.onPageRef
  })
  Opal.defn(scope, '$inline_anchor', function inlineAnchor (node) {
    if (node.getType() === 'xref') {
      if (node.getAttribute('path')) {
        const callback = this[$pageRefCallback]
        if (callback) {
          const attrs = node.getAttributes()
          if (attrs.fragment === Opal.nil) delete attrs.fragment
          const { content, target } = callback(attrs.refid, node.getText())
          let options
          // NOTE if resolved target starts with #, it's an unresolved xref
          if (target.charAt() === '#') {
            options = Opal.hash2(['type', 'target'], { type: 'link', target })
          } else {
            attrs.role = attrs.role ? 'page ' + attrs.role : 'page'
            options = Opal.hash2(['type', 'target', 'attrs'], {
              type: 'link',
              target,
              attributes: Opal.hash2(Object.keys(attrs), attrs),
            })
          }
          node = Opal.module(null, 'Asciidoctor').Inline.$new(node.getParent(), 'anchor', content, options)
        }
      }
    }
    return Opal.send(this, Opal.find_super_dispatcher(this, 'inline_anchor', inlineAnchor), [node])
  })
  return scope
})()

module.exports = Html5Converter
