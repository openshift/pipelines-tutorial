# diff-lines

[![build status](https://secure.travis-ci.org/smallhelm/diff-lines.svg)](https://travis-ci.org/smallhelm/diff-lines)

Given two strings, show the lines that differ. (similar to `git diff`)

```js
var diff = require('diff-lines');

var a = '';
a += 'one\n';
a += 'two\n';
a += 'three\n';

var b = '';
b += 'one\n';
b += 'three\n';
b += 'four\n';

console.log(diff(a, b));
```
Output:
```txt
 one
-two
 three
+four
```

## API
### diff(a, b[, options])
* `options.n_surrounding` - number of lines surrounding a diff to show. (default -1, show all lines)

## License
MIT
