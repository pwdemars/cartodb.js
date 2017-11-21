/* global Image, google */
var _ = require('underscore');
var GMapsLayerView = require('./gmaps-layer-view');
require('leaflet'); // NOTE: Leaflet needs to be required before wax because wax relies on global L internally
var wax = require('../../../vendor/wax');
var gridjson = require('../../../vendor/gridjson');
var C = require('../../constants');
var CartoDBDefaultOptions = require('./cartodb-default-options');
var Projector = require('./projector');
var CartoDBLayerGroupViewBase = require('../cartodb-layer-group-view-base');
var Profiler = require('cdb.core.Profiler');

var OPACITY_FILTER = 'progid:DXImageTransform.Microsoft.gradient(startColorstr=#00FFFFFF,endColorstr=#00FFFFFF)';
var EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function setImageOpacityIE8 (img, opacity) {
  var v = Math.round(opacity * 100);
  if (v >= 99) {
    img.style.filter = OPACITY_FILTER;
  } else {
    img.style.filter = 'alpha(opacity=' + (opacity) + ');';
  }
}

var GMapsCartoDBLayerGroupView = function (layerModel, gmapsMap) {
  var self = this;
  var hovers = [];

  _.bindAll(this, 'featureOut', 'featureOver', 'featureClick');

  var opts = _.clone(layerModel.attributes);

  opts.map = gmapsMap;

  var _featureOver = opts.featureOver;
  var _featureOut = opts.featureOut;
  var _featureClick = opts.featureClick;

  var previousEvent;
  var eventTimeout = -1;

  opts.featureOver = function (e, latlon, pxPos, data, layer) {
    if (!hovers[layer]) {
      self.trigger('layerenter', e, latlon, pxPos, data, layer);
    }
    hovers[layer] = 1;
    _featureOver && _featureOver.apply(this, arguments);
    self.featureOver && self.featureOver.apply(this, arguments);

    // if the event is the same than before just cancel the event
    // firing because there is a layer on top of it
    if (e.timeStamp === previousEvent) {
      clearTimeout(eventTimeout);
    }
    eventTimeout = setTimeout(function () {
      self.trigger('mouseover', e, latlon, pxPos, data, layer);
      self.trigger('layermouseover', e, latlon, pxPos, data, layer);
    }, 0);
    previousEvent = e.timeStamp;
  };

  opts.featureOut = function (m, layer) {
    if (hovers[layer]) {
      self.trigger('layermouseout', layer);
    }
    hovers[layer] = 0;
    if (!_.any(hovers)) {
      self.trigger('mouseout');
    }
    _featureOut && _featureOut.apply(this, arguments);
    self.featureOut && self.featureOut.apply(this, arguments);
  };

  opts.featureClick = _.debounce(function () {
    _featureClick && _featureClick.apply(this, arguments);
    self.featureClick && self.featureClick.apply(opts, arguments);
  }, 10);

  this.options = _.defaults(opts, CartoDBDefaultOptions);
  this.tiles = 0;

  wax.g.connector.call(this, opts);

  // lovely wax connector overwrites options so set them again
  // TODO: remove wax.connector here
  _.extend(this.options, opts);
  GMapsLayerView.apply(this, arguments);
  this.projector = new Projector(opts.map);
  CartoDBLayerGroupViewBase.apply(this, arguments);
};

// TODO: Do we need this?
GMapsCartoDBLayerGroupView.prototype = new wax.g.connector(); // eslint-disable-line
GMapsCartoDBLayerGroupView.prototype.interactionClass = gridjson.Interactive;
_.extend(
  GMapsCartoDBLayerGroupView.prototype,
  CartoDBLayerGroupViewBase.prototype,
  GMapsLayerView.prototype,
  {
    addToMap: function () {
      this.gmapsMap.overlayMapTypes.setAt(0, this);
    },

    remove: function () {
      var overlayIndex = this.gmapsMap.overlayMapTypes.getArray().indexOf(this);
      if (overlayIndex >= 0) {
        this.gmapsMap.overlayMapTypes.removeAt(0);
      }

      this._clearInteraction();
      this.finishLoading && this.finishLoading();
    },

    reload: function () {
      this.model.invalidate();
    },

    featureOver: function (e, latlon, pixelPos, data, layer) {
      var layerModel = this.model.getLayerInLayerGroupAt(layer);
      if (layerModel) {
        this.trigger('featureOver', {
          layer: layerModel,
          layerIndex: layer,
          latlng: [latlon.lat(), latlon.lng()],
          position: { x: pixelPos.x, y: pixelPos.y },
          feature: data
        });
      }
    },

    featureOut: function (e, layer) {
      var layerModel = this.model.getLayerInLayerGroupAt(layer);
      if (layerModel) {
        this.trigger('featureOut', {
          layer: layerModel,
          layerIndex: layer
        });
      }
    },

    featureClick: function (e, latlon, pixelPos, data, layer) {
      var layerModel = this.model.getLayerInLayerGroupAt(layer);
      if (layerModel) {
        this.trigger('featureClick', {
          layer: layerModel,
          layerIndex: layer,
          latlng: [latlon.lat(), latlon.lng()],
          position: { x: pixelPos.x, y: pixelPos.y },
          feature: data
        });
      }
    },

    error: function (e) {
      if (this.model) {
        this.model.trigger('error', e ? e.errors : 'unknown error');
        this.model.trigger('tileError', e ? e.errors : 'unknown error');
      }
    },

    ok: function (e) {
      this.model.trigger('tileOk');
    },

    tilesOk: function (e) {
      this.model.trigger('tileOk');
    },

    loading: function () {
      this.trigger('loading');
    },

    finishLoading: function () {
      this.trigger('load');
    },

    setOpacity: function (opacity) {
      if (isNaN(opacity) || opacity > 1 || opacity < 0) {
        throw new Error(opacity + ' is not a valid value, should be in [0, 1] range');
      }
      this.opacity = this.options.opacity = opacity;
      for (var key in this.cache) {
        var img = this.cache[key];
        img.style.opacity = opacity;
        setImageOpacityIE8(img, opacity);
      }
    },

    getTile: function (coord, zoom, ownerDocument) {
      var self = this;
      var ie = 'ActiveXObject' in window;
      var ielt9 = ie && !document.addEventListener;

      this.options.added = true;
      if (!this.model.hasTileURLTemplates()) {
        var key = zoom + '/' + coord.x + '/' + coord.y;
        var image = this.cache[key] = new Image(256, 256);
        image.src = EMPTY_GIF;
        image.setAttribute('gTileKey', key);
        image.style.opacity = this.options.opacity;
        return image;
      }

      var tile = wax.g.connector.prototype.getTile.call(this, coord, zoom, ownerDocument);

      // in IE8 semi transparency does not work and needs filter
      if (ielt9) {
        setImageOpacityIE8(tile, this.options.opacity);
      }
      tile.style.opacity = this.options.opacity;
      if (this.tiles === 0) {
        this.loading && this.loading();
      }

      this.tiles++;

      var loadTime = Profiler.metric('cartodb-js.tile.png.load.time').start();

      var finished = function () {
        loadTime.end();
        self.tiles--;
        if (self.tiles === 0) {
          self.finishLoading && self.finishLoading();
        }
      };

      tile.onload = finished;

      tile.onerror = function () {
        Profiler.metric('cartodb-js.tile.png.error').inc();
        self.model.addError({ type: C.WINDSHAFT_ERRORS.TILE });
        finished();
      };

      return tile;
    },

    _reload: function () {
      var tileURLTemplates;
      if (this.model.hasTileURLTemplates()) {
        tileURLTemplates = [ this.model.getTileURLTemplatesWithSubdomains()[0] ];
      } else {
        tileURLTemplates = [ EMPTY_GIF ];
      }

      // wax uses this
      this.options.tiles = tileURLTemplates;
      this.tiles = 0;
      this.cache = {};
      this._reloadInteraction();
      this._refreshView();
    },

    _refreshView: function () {
      var overlayIndex = this.gmapsMap.overlayMapTypes.getArray().indexOf(this);
      if (overlayIndex >= 0) {
        this.gmapsMap.overlayMapTypes.removeAt(overlayIndex);
      }
      this.gmapsMap.overlayMapTypes.setAt(0, this);
    },

    _checkLayer: function () {
      if (!this.options.added) {
        throw new Error('the layer is not still added to the map');
      }
    },

    _findPos: function (map, o) {
      return o.pixel;
    },

    /**
     * Creates an instance of a googleMaps Point
     */
    _newPoint: function (x, y) {
      return new google.maps.Point(x, y);
    },

    _manageOffEvents: function (map, o) {
      if (this.options.featureOut) {
        return this.options.featureOut && this.options.featureOut(o.e, o.layer);
      }
    },

    _manageOnEvents: function (map, o) {
      var point = this._findPos(map, o);
      var latlng = this.projector.pixelToLatLng(point);
      var eventType = o.e.type.toLowerCase();

      switch (eventType) {
        case 'mousemove':
          if (this.options.featureOver) {
            return this.options.featureOver(o.e, latlng, point, o.data, o.layer);
          }
          break;

        case 'click':
        case 'touchend':
        case 'touchmove': // for some reason android browser does not send touchend
        case 'mspointerup':
        case 'pointerup':
        case 'pointermove':
          if (this.options.featureClick) {
            this.options.featureClick(o.e, latlng, point, o.data, o.layer);
          }
          break;
        default:
          break;
      }
    }
  }
);

module.exports = GMapsCartoDBLayerGroupView;
