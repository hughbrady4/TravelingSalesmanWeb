const path = require('path');

const rootConfig = {
  mode: 'development',
  // mode: 'production',

  optimization: {
    usedExports: true, // tells webpack to tree-shake
  },
  devtool: 'eval-source-map'
};

const appConfig = {
  // The entry point file described above
  entry: {
    index: './src/index.js',
    onboard: './src/onboard.js',
    history: './src/history.js',
    auth: './src/auth.js',
    contact: './src/contact.js',
    profile: './src/profile.js',
  },
  // The location of the build folder described above
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].bundle.js'
  },

  // Optional and for development only. This provides the ability to
  // map the built code back to the original source format when debugging.
  devtool: 'eval-source-map',
};

const serviceWorkerConfig = {
  ...rootConfig,
  entry: './src/firebase-messaging-sw.js',
  // TODO(jhuleatt): Remove this once https://github.com/firebase/firebase-js-sdk/issues/5314 is resolved
  module: {
    rules: [
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  output: {
    filename: 'firebase-messaging-sw.js',
    path: path.resolve(__dirname, 'public'),
  },
};

module.exports = [appConfig, serviceWorkerConfig];