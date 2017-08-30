var CartoDBLayerModel = require('../geo/map/cartodb-layer.js');
var _ = require('underscore');

function Layer(params) {
  var self = this;

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

  this._cartoLayerModel.on('featureClick', function (data) { self.trigger('featureClick', data); });
  this._cartoLayerModel.on('featureOver', this.trigger, this);
  this._cartoLayerModel.on('featureOut', this.trigger, this);
}

_.extend(Layer.prototype, Backbone.Events);

Layer.prototype.getCartoDBLayer = function () {
  return this._cartoLayerModel;
};

Layer.prototype.setVis = function (visModel) {
  this._visModel = visModel;
};

Layer.prototype.setSource = function (source) {
  // TODO: Check if source is source type
  this._cartoLayerModel.set('sql', source);
  return this._visModel.reload();
};

Layer.prototype.setStyle = function (style) {
  // TODO: Check if source is style type
  this._cartoLayerModel.set('cartocss', style);
  return this._visModel.reload();
};

Layer.prototype.hide = function () {
  this._cartoLayerModel.hide();
  return this._visModel.repaint();
};

Layer.prototype.show = function () {
  this._cartoLayerModel.show();
  return this._visModel.repaint();
};

Layer.prototype.isVisible = function () {
  return this._cartoLayerModel.isVisible();
};

module.exports = {
  Layer: Layer,
  layer: function (params) {
    return new Layer(params); // TODO: revise the use of new
  }
};
