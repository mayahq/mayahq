module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          alias: {
            stream: false,
            'readable-stream': false,
          },
        },
      ],
      // 'react-native-reanimated/plugin', // Temporarily commented out
      // [ // Temporarily commented out
      //   'module-resolver',
      //   {
      //     alias: {
      //       stream: 'stream-browserify',
      //       crypto: 'react-native-crypto',
      //       buffer: 'buffer',
      //       process: 'process',
      //       url: 'url',
      //       assert: 'assert',
      //       'react-native-gesture-handler': 'react-native-gesture-handler',
      //       'react-native-url-polyfill': './node-polyfills.js'
      //     },
      //   },
      // ],
    ],
  };
}; 