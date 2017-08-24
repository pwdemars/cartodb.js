var path = require('path');

module.exports = {
  // entry point of the app.
  entry: './src/index.js',
  // Information about the bundle
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'carto.js',
    // Library name when loading the library on a browser (leaflet: L, jquery: $)
    library: "carto",
    // The bundle will be compiled in UMD.
    libraryTarget: "umd",
  },
  // Tell webpack to generate sourcemaps for easy-degug
  devtool: 'source-map',
  module: {
    // Required for loading the templates
     loaders: [
         { test: /\.tpl$/, loader: "underscore-template-loader" }
     ]
 },
  node: {
    fs: "empty",
    path: "empty",
  }
};
