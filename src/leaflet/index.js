var L = require('leaflet');
var AnonymousMap = require('../windshaft/anonymous-map');
var MapsAPIClient = require('../windshaft/client');
var LayersCollection = require('../geo/map/layers');
var CartoDBLayerGroup = require('../geo/cartodb-layer-group');
var ModelUpdater = require('../windshaft-integration/model-updater');
var Layer = require('../layers').Layer;


function cartoLayerGroup(params) {
  var _view;
  var anonymousMap;
  var modelUpdater;
  var visModel;

  if (!params.apiKey) {
    throw new Error('API Key is required');
  }

  if (!params.url) {
    throw new Error('URL  is required');
  }

  if (!params.username) {
    throw new Error('Username is required');
  }

  // Responsabilities:
  //   - Call the windshaft api to instantiate the map.
  //   - Decides when to use GET (JSON or lzma) or POST
  var mapsAPIClient = new MapsAPIClient({
    urlTemplate: params.url,
    userName: params.username,
    // apiKey: params.apiKey,
  });

  var layersCollection = new LayersCollection(params.layers.map(function (layer) { return layer.getCartoDBLayer(); }));
  var dataviewsCollection = new Backbone.Collection();
  var analysisCollection = new Backbone.Collection();

  // Responsabilities:
  //   - "Groups" CartoDBLayers
  //   - Gets set attrs (by ModelUpdater): urls (tiles, grids, attributes, etc.), index of layers in Maps API
  //   - Methods to generate tile URLs, grid URLs, etc:
  var cartoDBLayerGroup = new CartoDBLayerGroup({
    apiKey: params.apiKey // TODO: Use "authenticator" object instead of attribute
  }, {
      layersCollection: layersCollection
    });

  visModel = {
    setOk: function () { },
    setError: function () { },
    repaint: function () {
      _view.setUrl(cartoDBLayerGroup.getTileURLTemplate());
    },
    reload: function () {
      if (!_view) {
        console.info('map not initialized');
        return Promise.resolve();
      }
      return new Promise(function (resolve, reject) {
        anonymousMap.createInstance({
          success: function (response) {
            _view.setUrl(cartoDBLayerGroup.getTileURLTemplate());
            resolve();
          },
          error: reject
        });
      });
    }
  };

  // Responsabilities:
  //   - .updateModels(wrraper of response from Maps API) -> updates models:
  //      - layers (sets cartocss metadata, errors)
  //      - dataviews (sets urls, errors)
  //      - analysis (sets polling urls, errors)
  //      - layerGroupModel (sets urls, layer indexes)
  //      - visModel (errors)
  modelUpdater = new ModelUpdater({
    visModel: visModel,
    mapModel: {},
    layerGroupModel: cartoDBLayerGroup,
    layersCollection: layersCollection,
    dataviewsCollection: dataviewsCollection,
    analysisCollection: analysisCollection
  });

  // Anonymous & Namedmap. Responsibilties:
  //   - .toJSON() -> Generates payload (from collections) that is sent to Maps API 
  //   - .createInstance(...) -> Uses .toJSON() and uses client to sent request to Maps API
  //   - Backbone attrs & other methods -> Wraps response from Maps API and adds helper methods
  anonymousMap = new AnonymousMap({
    apiKey: params.apiKey
  }, {
      layersCollection: layersCollection,
      dataviewsCollection: dataviewsCollection,
      analysisCollection: analysisCollection,

      client: mapsAPIClient,
      modelUpdater: modelUpdater,

      windshaftSettings: {
        urlTemplate: params.url,
        userName: params.username
      }
    });

  var self = {
    addTo: function addTo(leafletMap) {
      return new Promise(function (resolve, reject) {
        anonymousMap.createInstance({
          success: resolve,
          error: reject
        });
      }).then(function (response) {
        _view = L.tileLayer(cartoDBLayerGroup.getTileURLTemplate()).addTo(leafletMap);
        return self;
      });
    },

    addLayer: function (layer) {
      if (!(layer instanceof Layer)) {
        throw new TypeError('.addLayer requires a www.google.com carto.layer object');
      }
      layer.setVis(visModel);
      layersCollection.add(layer.getCartoDBLayer());
      return visModel.reload();
    },
    removeLayer: function (layer) {
      if (!(layer instanceof Layer)) {
        throw new TypeError('.addLayer requires a carto.layer object');
      }
      layersCollection.remove(layer.getCartoDBLayer());
      return visModel.reload();
    },
    getLayers: function () { },
    showLayer: function (layer) { },
    hideLayer: function (layer) { },
  };


  return self;
}


module.exports = {
  cartoLayerGroup: cartoLayerGroup,
};
