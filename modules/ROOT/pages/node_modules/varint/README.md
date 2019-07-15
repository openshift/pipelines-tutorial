# varint

decode [protobuf-style varint bytes](https://developers.google.com/protocol-buffers/docs/encoding#varints) and emit whole integers when enough have been accumulated that a number can be constructed; also encode whole numbers to an array of varint style bytes.

```javascript
var varint = require('varint')

var bytes = varint.encode(300) // === [0xAC, 0x02]
  , vi = varint()

vi.once('data', function(num) {
  console.log('got', num)
})

vi.write(bytes[0])
vi.write(bytes[1]) // "got 300"

```

## api

### varint = require('varint')

### varint.encode(num[, output=[], offset=0]) -> array

encodes `num` into either the array given by `offset` or a new array at `offset`
and returns that array.

### vi = varint() -> EventEmitter

return a new `varint` instance.

### vi.write(byte) -> undefined

write a byte to the varint. if the byte is "final" (i.e., does not have the bit at `0x80` set),
it will attempt to compile the number and emit it as a `data` event.

# License

MIT
