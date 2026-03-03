// Wrapper for react-native-voice to handle Expo Go
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

// Mock Voice implementation for Expo Go
const MockVoice = {
  onSpeechStart: null,
  onSpeechEnd: null,
  onSpeechResults: null,
  onSpeechError: null,
  onSpeechPartialResults: null,
  onSpeechVolumeChanged: null,
  
  start: async () => {
    console.warn('Voice.start called but Voice is not available in Expo Go');
    return Promise.resolve();
  },
  stop: async () => {
    console.warn('Voice.stop called but Voice is not available in Expo Go');
    return Promise.resolve();
  },
  cancel: async () => {
    console.warn('Voice.cancel called but Voice is not available in Expo Go');
    return Promise.resolve();
  },
  destroy: async () => {
    console.warn('Voice.destroy called but Voice is not available in Expo Go');
    return Promise.resolve();
  },
  isAvailable: async () => {
    return Promise.resolve(false);
  },
  isRecognizing: async () => {
    return Promise.resolve(false);
  },
  removeAllListeners: () => {},
};

// Always use MockVoice for now to avoid bundling issues
const Voice = MockVoice;

export default Voice;