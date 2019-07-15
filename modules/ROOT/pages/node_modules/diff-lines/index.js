var JsDiff = require('diff');

module.exports = function(a, b, opts){
  opts = opts || {};
  var n_surrounding = opts.n_surrounding >= 0 ? opts.n_surrounding : -1;

  var diffs = JsDiff.diffLines(a, b, {ignoreWhitespace: false});

  var out = [];

  var lines_with_change = [];

  diffs.forEach(function(d){
    var mod = d.removed && d.added ? '!' : (d.removed ? '-' : (d.added ? '+' : ' '));
    var lines = d.value.split('\n');
    if(lines.length > 0 && lines[lines.length - 1] === ''){
      lines = lines.slice(0, lines.length - 1);
    }
    lines.forEach(function(line){
      if(mod !== ' ' && n_surrounding >= 0){
        lines_with_change.push(out.length);
      }
      out.push(mod + line);
    });
  });

  if(n_surrounding >= 0){
    var short_out = {};
    lines_with_change.forEach(function(line_i){
      var i, j;
      for(i = -n_surrounding; i < n_surrounding + 1; i++){
        j = line_i + i;
        if(j >= 0 && j < out.length){
          short_out[j] = out[j];
        }
      }
    });
    out = [];
    var last_key;
    var key;
    for(key in short_out){
      if(short_out.hasOwnProperty(key)){
        if(last_key !== undefined && parseInt(key) !== (parseInt(last_key) + 1)){
          out.push('@@');
        }
        out.push(short_out[key]);
        last_key = key;
      }
    }
  }

  return out.join('\n');
};
