var varint = require('./index')
  , test = require('tape')

test('fuzz test', function(assert) {
  var vi = varint()
    , expect
    , encoded

  vi.on('data', function(data) {
    assert.equal(expect, data, 'fuzz test: '+expect.toString(16))
  })

  for(var i = 0, len = 100; i < len; ++i) {
    expect = randint(0x7FFFFFFF)
    encoded = varint.encode(expect)
 
    for(var x = 0; x < encoded.length; ++x) {
      vi.write(encoded[x])
    } 
  }

  assert.end()
})

test('test single byte works as expected', function(assert) {
  var num = [0xAC, 0x02]
  var acc = varint()

  acc.on('data', function(data) {
    assert.equal(data, 300, 'should equal 300 every time')
  })

  for(var i = 0, len = 10; i < len; ++i) {
    acc.write(0xAC)
    acc.write(0x02)
  }

  assert.end()
})

test('test encode works as expected', function(assert) {
  var out = []

  assert.deepEqual(varint.encode(300), [0xAC, 0x02])

  assert.end()
})

test('test decode single bytes', function(assert) {
  var vi = varint()
    , expected = randint(parseInt('1111111', '2'))

  vi.once('data', function(data) {
    assert.equal(data, expected)
    assert.end()
  })

  vi.write(expected)
})

test('test decode multiple bytes with zero', function(assert) {
  var vi = varint()
    , expected = randint(parseInt('1111111', '2'))

  vi.once('data', function(data) {
    assert.equal(data, expected << 7)
    assert.end()
  })

  vi.write(0x80)
  vi.write(expected)
})

test('encode single byte', function(assert) {
  var expected = randint(parseInt('1111111', '2'))
  assert.deepEqual(varint.encode(expected), [expected])
  assert.end()
})

test('encode multiple byte with zero first byte', function(assert) {
  var expected = 0x0F00
  assert.deepEqual(varint.encode(expected), [0x80, 0x1E])
})

function randint(range) {
  return ~~(Math.random() * range)  
}
