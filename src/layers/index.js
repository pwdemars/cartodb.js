var cartoDBLayerModel = require('../geo/map/cartodb-layer.js');

function layer(params) {
  /**
   * TODO allow a cartodbLayerModel to be instantiated without vis.
   */
  return new cartoDBLayerModel({
    sql: params.source,
    cartocss:  params.style
  }, {
    vis: {
      on: function () {}
    }
  });
}

module.exports = {
  layer: layer,
};
