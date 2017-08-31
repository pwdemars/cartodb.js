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
  var interactions = [];

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
      return _instantiateMap(_view);
    }
  };

  var layersCollection = new LayersCollection(params.layers.map(function (layer) {
    layer.setVis(visModel);
    return layer.getCartoDBLayer();
  }));
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
      return _instantiateMap(leafletMap);
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

  /**
   * Instantiates a map
   *   - Load urls from api
   *   - Set interactivity
   *   - Add a leaflet layer
   */
  function _instantiateMap(leafletMap) {
    return new Promise(function (resolve, reject) {
      anonymousMap.createInstance({ success: resolve, error: reject });
    }).then(function (response) {
      // If there is already a view reuse it.
      if (_view) {
        _view.setUrl(cartoDBLayerGroup.getTileURLTemplate());
      } else {
        _view = L.tileLayer(cartoDBLayerGroup.getTileURLTemplate()).addTo(leafletMap);
      }
      
      _reloadInteractivity(leafletMap, layersCollection, cartoDBLayerGroup);
      return self;
    });
  }

  function _reloadInteractivity(leafletMap, layersCollection, cartoDBLayerGroup) {
    // Disbale interactivity
    interactions.forEach(function (interaction) { interaction.remove(); });

    // Enable interactivity
    interactions = layersCollection.map(function (layerModel, layerIndexInLayerGroup) {
      var tilejson = {
        tilejson: '2.0.0',
        scheme: 'xyz',
        grids: cartoDBLayerGroup.getGridURLTemplatesWithSubdomains(layerIndexInLayerGroup),
        tiles: cartoDBLayerGroup.getTileURLTemplatesWithSubdomains(),
        formatter: function (options, data) { return data; }
      };
      return wax.leaf.interaction().map(leafletMap)
        .tilejson(tilejson)
        .on('on', function (event) {
          if (!event) {
            return;
          }
          var originalEventType = event.e.type;
          var eventTypeMap = {
            'click': 'featureClick',
            'mousemove': 'featureOver'
          };
          var eventType = eventTypeMap[originalEventType];

          var latlng = leafletMap.layerPointToLatLng(new L.Point(event.e.clientX, event.e.clientY));          
          if (eventType === 'featureOver') {
            layerModel.trigger(eventType, {
              latlng: {
                lat: latlng.lat,
                lng: latlng.lng
              },
              data: event.data
            });  
          } else { // featureClick -> Fetch data from attributes service
            cartoDBLayerGroup.fetchAttributes(layerIndexInLayerGroup, event.data.cartodb_id, function (data) {
              if (data) {
                layerModel.trigger(eventType, {
                  latlng: {
                    lat: latlng.lat,
                    lng: latlng.lng
                  },
                  data: data
                });  
              }
            });
          }
        })
        .on('off', function () { });
    });
  }


  return self;
}




module.exports = {
  cartoLayerGroup: cartoLayerGroup,
};
