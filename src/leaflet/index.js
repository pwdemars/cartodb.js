var L = require('leaflet');
var HEADERS = new Headers({
  'Content-Type': 'application/json'
});


function cartoLayerGroup(params) {
  var promise = fetch(params.url, {
    method: 'POST',
    headers: HEADERS,
    body: _buildBody(params),
    qs: {
      api_key: params.apiKey
    }
  })
    .then(function (data) { return data.json(); })
    .then(function (data) { return 'https://cartocdn-ashbu_a.global.ssl.fastly.net/iago-carto/api/v1/map/' + data.layergroupid + '/0/{z}/{x}/{y}.png'; });

  return {
    addTo: function addTo(map) {
      promise.then(function (url) {
        L.tileLayer(url).addTo(map);
      });
    }
  };


}

function _buildBody(params) {
  return JSON.stringify({ layers: params.layers, api_key: params.apiKey });
}


module.exports = {
  cartoLayerGroup: cartoLayerGroup,
};
