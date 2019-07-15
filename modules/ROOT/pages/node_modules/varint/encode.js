module.exports = encode

var MSB = 0x80
  , REST = 0x7F
  , MSBALL = ~REST

function encode(num, out, offset) {
  out = out || []
  offset = offset || 0

  while(num & MSBALL) {
    out[offset++] = (num & 0xFF) | MSB 
    num >>>= 7
  }
  out[offset] = num
  return out
}