// Import the entire react-native-gesture-handler module and re-export it
try {
  const GestureHandler = require('react-native-gesture-handler');
  module.exports = GestureHandler;
  console.log('Successfully loaded gesture-handler via direct require');
} catch (e) {
  console.error('Failed to load gesture-handler:', e);
  // Provide a minimal fallback
  module.exports = {
    State: {
      UNDETERMINED: 0,
      BEGAN: 1,
      ACTIVE: 2,
      CANCELLED: 3,
      FAILED: 4,
      END: 5
    },
    Direction: {
      RIGHT: 1,
      LEFT: 2,
      UP: 4,
      DOWN: 8
    }
  };
} 