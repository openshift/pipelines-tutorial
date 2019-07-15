var suite = new (require('benchmark').Suite),
	nick = require('..'),
	_ = require('lodash'),
	doT = require('dot'),
	hbs = require('handlebars');

var nickt = nick('My name is { name }, and I am a { job } working at { company }. I have { years } years of experience in the field of { field }.'),
	_t = _.template('My name is <%= name %>, and I am a <%= job %> working at <%= company %>. I have <%= years %> years of experience in the field of <%= field %>.'),
	doTt = doT.template('My name is {{=it.name}}, and I am a {{=it.job}} working at {{=it.company}}. I have {{=it.years}} years of experience in the field of {{=it.field}}.'),
	hbst = hbs.compile('My name is {{ name }}, and I am a {{ job }} working at {{ company }}. I have {{ years }} years of experience in the field of {{ field }}.')

var data = {
	name: 'Haskell Curry',
	job: 'logician',
	company: 'λ Combinator',
	years: 100,
	field: 'combinatory logic'
};

console.assert(_.uniq([nickt, _t, doTt, hbst].map(function(fn) {
	return fn(data);
})).length == 1);

suite.add('nick', function() {
	nickt(data);
}).add('lodash', function() {
	_t(data);
}).add('doT', function() {
	doTt(data);
}).add('Handlebars', function() {
	hbst(data);
}).on('cycle', function(event) {
	console.log(String(event.target));
}).on('complete', function() {
	console.log('Fastest is ' + this.filter('fastest').pluck('name'));
}).run({ async: true });
