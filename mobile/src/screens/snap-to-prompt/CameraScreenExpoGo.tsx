import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function CameraScreenExpoGo({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera Not Available</Text>
      <Text style={styles.message}>
        The camera feature requires a development build.
        {'\n\n'}
        It's not available in Expo Go.
      </Text>
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#7B61FF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});