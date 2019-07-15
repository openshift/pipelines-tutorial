var nick = require('..');

var intro = nick('Hello, my name is { name } and I am { age } years old.');
console.assert(intro({ name: 'Nick', age: '17' }) == 'Hello, my name is Nick and I am 17 years old.');

console.assert(nick('{ s }')() == '');
console.assert(nick('{ s }')({ s: 4 }) == '4');
console.assert(nick('|s|', /\|/)({ s: 4 }) == '4');
console.assert(nick('[s]', /[\[\]]/)({ s: 4 }) == '4');
console.assert(nick('<s>', /[<>]/)({ s: 4 }) == '4');
console.assert(nick('lol<s>lol lol<t>lol', /lol<|>lol/)({ s: 4, t: 5 }) == '4 5');
console.assert(nick('{{{{<<<<s>>>>}}}} [[[[||||t||||]]]]', /[<>\{\}\[\]\|]+/)({ s: 4, t: 5 }) == '4 5');
