module.exports = function(t, delimiter) {
	var pieces = t.split(delimiter || /[\{\}]/),
		parity = false,
		head = pieces.shift();
	if (head == '') {
		head = pieces.shift();
		parity = true;
	}
	if (pieces[pieces.length - 1] == '') {
		pieces.pop();
	}
	var fn = 'o=o||{};return ' + (parity ? '(o.' + head.trim() + '||\'\')' : '\'' + head + '\'');
	for (var i = 0; i < pieces.length; i++) {
		var piece = pieces[i];
		fn += '+' + ((i % 2 == parity) ? '(o.' + piece.trim() + '||\'\')' : '\'' + piece + '\'');
	}
	return new Function('o', fn);
};
