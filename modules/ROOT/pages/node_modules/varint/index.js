module.exports = varint

varint.encode = require('./encode.js');

var EE = require('events').EventEmitter
  , Decoder = require('./decode.js')

function varint() {
  var ee = new EE
    , dec = new Decoder

  dec.ondata = function (item) {
    ee.emit("data", item)
  }

  ee.write = function (item) {
    dec.write(item);
  }

  return ee
}

