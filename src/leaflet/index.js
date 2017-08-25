var L = require('leaflet');
var AnonymousMap = require('../windshaft/anonymous-map');
var MapsAPIClient = require('../windshaft/client');
var LayersCollection = require('../geo/map/layers');
var CartoDBLayerGroup = require('../geo/cartodb-layer-group');
var ModelUpdater = require('../windshaft-integration/model-updater');

var HEADERS = new Headers({
  'Content-Type': 'application/json'
});

function cartoLayerGroup(params) {
  var anonymousMap;
  var modelUpdater;

  // Responsabilities:
  //   - Call the windshaft api to instantiate the map.
  //   - Decides when to use GET (JSON or lzma) or POST
  var mapsAPIClient = new MapsAPIClient({
    urlTemplate: params.url,
    userName: params.username
  });

  var layersCollection = new LayersCollection(params.layers);
  var dataviewsCollection = new Backbone.Collection();
  var analysisCollection = new Backbone.Collection();

  // Responsabilities:
  //   - "Groups" CartoDBLayers
  //   - Gets set attrs (by ModelUpdater): urls (tiles, grids, attributes, etc.), index of layers in Maps API
  //   - Methods to generate tile URLs, grid URLs, etc:
  var cartoDBLayerGroup = new CartoDBLayerGroup(null, {
    layersCollection: layersCollection
  });

  // Responsabilities:
  //   - .updateModels(wrraper of response from Maps API) -> updates models:
  //      - layers (sets cartocss metadata, errors)
  //      - dataviews (sets urls, errors)
  //      - analysis (sets polling urls, errors)
  //      - layerGroupModel (sets urls, layer indexes)
  //      - visModel (errors)
  modelUpdater = new ModelUpdater({
    visModel: { setOk: function () {} },
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
  anonymousMap = new AnonymousMap(null, {
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


  var promise = new Promise(function (resolve, reject) {
    anonymousMap.createInstance({
      success: resolve,
      error: reject
    });
  });

  return {
    addTo: function addTo(leafletMap) {
      promise
        .then(function (response) {
          L.tileLayer(cartoDBLayerGroup.getTileURLTemplate()).addTo(leafletMap);
        })
        .catch(console.error);
    },

    addLayer: function (layer) { },
    removeLayer: function(layer){},
    getLayers: function(){},
    showLayer: function(layer){},
    hideLayer: function(layer){},
  };
}


module.exports = {
  cartoLayerGroup: cartoLayerGroup,
};
