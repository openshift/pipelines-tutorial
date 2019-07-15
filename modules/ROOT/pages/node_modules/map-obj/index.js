'use strict';

// Customized for this use-case
const isObject = value =>
	typeof value === 'object' &&
	value !== null &&
	!(value instanceof RegExp) &&
	!(value instanceof Error) &&
	!(value instanceof Date);

const mapObject = (object, fn, options, isSeen = new WeakMap()) => {
	options = Object.assign({
		deep: false,
		target: {}
	}, options);

	if (isSeen.has(object)) {
		return isSeen.get(object);
	}

	isSeen.set(object, options.target);

	const {target} = options;
	delete options.target;

	const mapArray = array => array.map(x => isObject(x) ? mapObject(x, fn, options, isSeen) : x);
	if (Array.isArray(object)) {
		return mapArray(object);
	}

	/// TODO: Use `Object.entries()` when targeting Node.js 8
	for (const key of Object.keys(object)) {
		const value = object[key];
		let [newKey, newValue] = fn(key, value, object);

		if (options.deep && isObject(newValue)) {
			newValue = Array.isArray(newValue) ?
				mapArray(newValue) :
				mapObject(newValue, fn, options, isSeen);
		}

		target[newKey] = newValue;
	}

	return target;
};

module.exports = mapObject;
