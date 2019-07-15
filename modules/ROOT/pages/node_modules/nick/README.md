# nick
## The smallest templating engine ever.

`nick` is a no-nonsense string templating engine written in 10 lines (plus 8 lines of optimization).

A browser build is available [here](https://raw.githubusercontent.com/edge/nick/master/lib/nick.js). It is available globally as `Nick`.

* [Installation](#installation)
* [Usage](#usage)
	* [API](#api)
	* [Basic](#basic)
	* [Custom Delimiters](#custom-delimiters)
* [Benchmarks](#benchmarks)

## Installation

```
$ npm i nick
```

## Usage

### API

```
nick(templateString, [delimiterRegex])
```

### Basic

Anything inside a pair of delimiters will be a simple object access.

```js
var nick = require('nick');

// Create a reusable template function
var resume = nick('My name is { name }, and I am a { job } working at { company }. I have { years } years of experience in the field of { field }.');

var me = resume({
	name: 'Haskell Curry',
	job: 'logician',
	company: 'λ Combinator',
	years: 100,
	field: 'combinatory logic'
});

// My name is Haskell Curry, and I am a logician working at λ Combinator. I have 100 years of experience in the field of combinatory logic.
```

### Custom Delimiters

`nick` also takes a regular expression as an optional second argument, which defines what delimiter is used for the template.

```js
var thing = nick('I like to do {{{{{adjective}}}}} things.', /[\{\}]{5}/);

var result = thing({ adjective: 'random' });

// I like to do random things.
```

## Benchmarks

The benchmarks were written with templates in the recommended style of their respective engines, profiling the performance of the example provided in [Basic](#basic).

```
nick x 13,253,638 ops/sec ±0.88% (96 runs sampled)
lodash x 510,826 ops/sec ±0.23% (101 runs sampled)
doT x 12,309,561 ops/sec ±0.82% (98 runs sampled)
Handlebars x 2,196,357 ops/sec ±0.44% (99 runs sampled)
```

![https://dl.bucket.pw/fyiyux.png](https://dl.bucket.pw/fyiyux.png)
