module.exports = Decoder

var MSB = 0x80
  , REST = 0x7F


function Decoder() {
  this.accum = []
}
Decoder.prototype.write = write;

function write(byte) {
  var msb = byte & MSB
    , accum = this.accum
    , len
    , out

  accum[accum.length] = byte & REST
  if(msb) {
    return
  }

  len = accum.length
  out = 0

  for(var i = 0; i < len; ++i) {
    out |= accum[i] << (7 * i)
  }

  accum.length = 0
  this.ondata(out)
  return
}