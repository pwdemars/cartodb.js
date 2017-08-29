var CartoDBLayerModel = require('../geo/map/cartodb-layer.js');

function Layer(params) {
  /**
   * TODO allow a cartodbLayerModel to be instantiated without vis.
   */
  this._cartoLayerModel = new CartoDBLayerModel({
    // type: 'CartoDB', // this should be extended but is failing! :S
    sql: params.source,
    cartocss: params.style,
  }, {
      vis: {
        on: function () { },
        reload: function () { }
      }
    });
}

Layer.prototype.getCartoDBLayer = function () {
  return this._cartoLayerModel;
};

Layer.prototype.setVis = function (visModel) {
  this._visModel = visModel;
};

Layer.prototype.setSource = function (source) {
  var self = this;
  // TODO: Check if source is source type
  self._cartoLayerModel.set('sql', source);
  return self._visModel.reload();
};

module.exports = {
  Layer: Layer,
  layer: function (params) {
    return new Layer(params); // TODO: revise the use of new
  }
};
