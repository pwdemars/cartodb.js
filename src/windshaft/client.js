var $ = require('jquery');
var _ = require('underscore');
var LZMA = require('lzma');
var util = require('../core/util');
var WindshaftConfig = require('./config');
var RequestTracker = require('./request-tracker');
var WindshaftError = require('./error');
var log = require('../cdb.log');
var Request = require('./request');

var validatePresenceOfOptions = function (options, requiredOptions) {
  var missingOptions = _.filter(requiredOptions, function (option) {
    return !options[option];
  });
  if (missingOptions.length) {
    throw new Error('WindshaftClient could not be initialized. The following options are missing: ' + missingOptions.join(', '));
  }
};

var MAX_URL_LENGTH = 2033;
var COMPRESSION_LEVEL = 3;
/* The max number of times the same map can be instantiated */
var MAP_INSTANTIATION_LIMIT = 3;

/**
 * Windshaft client. It provides a method to create instances of maps in Windshaft.
 * @param {object} options Options to set up the client
 */
var WindshaftClient = function (settings) {
  validatePresenceOfOptions(settings, ['urlTemplate', 'userName']);

  if (settings.templateName) {
    this.endpoints = {
      get: [WindshaftConfig.MAPS_API_BASE_URL, 'named', settings.templateName, 'jsonp'].join('/'),
      post: [WindshaftConfig.MAPS_API_BASE_URL, 'named', settings.templateName].join('/')
    };
  } else {
    this.endpoints = {
      get: WindshaftConfig.MAPS_API_BASE_URL,
      post: WindshaftConfig.MAPS_API_BASE_URL
    };
  }

  this.url = settings.urlTemplate.replace('{user}', settings.userName);
  this._requestTracker = new RequestTracker(MAP_INSTANTIATION_LIMIT);
};

WindshaftClient.prototype.instantiateMap = function (options) {
  if (!options.mapDefinition) {
    throw new Error('mapDefinition option is required');
  }

  var mapDefinition = options.mapDefinition;
  var params = options.params || {};
  var successCallback = options.success;
  var errorCallback = options.error;

  var ajaxOptions = {
    success: function (data) {
      if (data.errors) {
        errorCallback(data);
      } else {
        successCallback(data);
      }
    },
    error: function (xhr, textStatus) {
      // Ignore error if request was explicitly aborted
      if (textStatus === 'abort') return;

      var errors = {};
      try {
        errors = JSON.parse(xhr.responseText);
      } catch (e) { }
      errorCallback(errors);
    }
  };

  var encodedURL = this._generateEncodedURL(mapDefinition, params);
  if (this._isURLValid(encodedURL)) {
    this._get(encodedURL, ajaxOptions);
  } else {
    this._generateCompressedURL(mapDefinition, params, function (compressedURL) {
      if (this._isURLValid(compressedURL)) {
        this._get(compressedURL, ajaxOptions);
      } else {
        var url = this._getURL(params, 'post');
        this._post(url, mapDefinition, ajaxOptions);
      }
    }.bind(this));
  }
};

WindshaftClient.prototype._generateEncodedURL = function (payload, params) {
  params = _.extend({
    config: JSON.stringify(payload)
  }, params);

  return this._getURL(params);
};

WindshaftClient.prototype._generateCompressedURL = function (payload, params, callback) {
  var data = JSON.stringify({
    config: JSON.stringify(payload)
  });

  LZMA.compress(data, COMPRESSION_LEVEL, function (compressedPayload) {
    params = _.extend({
      lzma: util.array2hex(compressedPayload)
    }, params);

    callback(this._getURL(params));
  }.bind(this));
};

WindshaftClient.prototype._isURLValid = function (url) {
  return url.length < MAX_URL_LENGTH;
};

WindshaftClient.prototype._post = function (url, payload, options) {
  this._abortPreviousRequest();
  this._previousRequest = $.ajax({
    url: url,
    crossOrigin: true,
    method: 'POST',
    dataType: 'json',
    contentType: 'application/json',
    data: JSON.stringify(payload),
    success: options.success,
    error: options.error
  });
};

WindshaftClient.prototype._get = function (url, options) {
  this._abortPreviousRequest();
  this._previousRequest = $.ajax({
    url: url,
    method: 'GET',
    dataType: 'jsonp',
    jsonpCallback: this._jsonpCallbackName(url),
    cache: true,
    success: options.success,
    error: options.error
  });
};

WindshaftClient.prototype._abortPreviousRequest = function () {
  if (this._previousRequest) {
    this._previousRequest.abort();
  }
};

WindshaftClient.prototype._getURL = function (params, method) {
  method = method || 'get';
  var queryString = this._convertParamsToQueryString(params);
  var endpoint = this.endpoints[method];
  return [this.url, endpoint].join('/') + queryString;
};

WindshaftClient.prototype._convertParamsToQueryString = function (params) {
  var queryString = [];
  _.each(params, function (value, name) {
    if (value instanceof Array) {
      _.each(value, function (oneValue) {
        queryString.push(name + '[]=' + oneValue);
      });
    } else if (value instanceof Object) {
      queryString.push(name + '=' + encodeURIComponent(JSON.stringify(value)));
    } else {
      queryString.push(name + '=' + encodeURIComponent(value));
    }
  });
  return queryString.length > 0 ? '?' + queryString.join('&') : '';
};

WindshaftClient.prototype._jsonpCallbackName = function (payload) {
  return '_cdbc_' + util.uniqueCallbackName(payload);
};

WindshaftClient.prototype._canPerformRequest = function (request) {
  return this._requestTracker.canRequestBePerformed(request);
};

WindshaftClient.prototype._trackRequest = function (request, response) {
  this._requestTracker.track(request, response);
};

WindshaftClient.prototype.performRequest = function (payload, params, options) {
  var request = new Request(payload, params, options);
  if (this._canPerformRequest(request)) {
    this._performRequest(request);
  } else {
    log.error('Maximum number of subsequent equal requests to the Maps API reached (' + MAP_INSTANTIATION_LIMIT + '):', payload, params);
    options.error && options.error();
  }
};

/**
 * 
 */
WindshaftClient.prototype._performRequest = function (request) {
  var payload = request.payload;
  var params = request.params;
  var options = request.options;
  this.instantiateMap({
    mapDefinition: payload,
    params: params,
    success: function (response) {
      this._trackRequest(request, response);
      options.success && options.success(response);
    }.bind(this),
    error: function (response) {
      this._trackRequest(request, response);
      var windshaftErrors = this._getErrorsFromResponse(response);
      options.error && options.error(windshaftErrors);
    }.bind(this)
  });
};

WindshaftClient.prototype._getErrorsFromResponse = function (response) {
  if (response.errors_with_context) {
    return _.map(response.errors_with_context, function (error) {
      return new WindshaftError(error);
    });
  }
  if (response.errors) {
    return [
      new WindshaftError({ message: response.errors[0] })
    ];
  }

  return [];
};

module.exports = WindshaftClient;
