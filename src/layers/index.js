function layer(params) {
  var source = params.source;
  var style = params.style;

  var l = {
    type: 'mapnik',
    options: {
      cartocss_version: '2.1.1',
      cartocss: style,
      sql: source
    }
  };
  return l;
}

module.exports = {
  layer: layer,
};
