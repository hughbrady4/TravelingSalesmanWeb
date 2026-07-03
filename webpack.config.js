const path = require('path');
const webpack = require('webpack');

module.exports = (env = {}) => {
  const buildMode = env.buildMode || 'dev';
  const isDevBuild = buildMode === 'dev';
  const isBetaBuild = buildMode === 'beta';
  const webpackMode = isDevBuild ? 'development' : 'production';
  const devtool = isDevBuild || isBetaBuild ? 'eval-source-map' : false;

  const rootConfig = {
    mode: webpackMode,
    optimization: {
      usedExports: true,
    },
    devtool,
  };

  const appConfig = {
    ...rootConfig,
    entry: {
      index: './src/index.js',
      getstarted: './src/getstarted.js',
      onboard: './src/onboard.js',
      createproduct: './src/create-product.js',
      merchantdetails: './src/merchant-details.js',
      history: './src/history.js',
      request: './src/request.js',
      auth: './src/auth.js',
      contact: './src/contact.js',
      profile: './src/profile.js',
    },
    output: {
      path: path.resolve(__dirname, 'public'),
      filename: '[name].bundle.js',
    },
    plugins: [
      new webpack.DefinePlugin({
        __BUILD_MODE__: JSON.stringify(buildMode),
        __USE_AUTH_EMULATOR__: JSON.stringify(isDevBuild),
      }),
    ],
  };

  const serviceWorkerConfig = {
    ...rootConfig,
    entry: './src/firebase-messaging-sw.js',
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

  return [appConfig, serviceWorkerConfig];
};