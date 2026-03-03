#!/usr/bin/env python3

import os
import subprocess
import tempfile
import time
from pathlib import Path
import shutil

import numpy as np
import sounddevice as sd
import whisper
import torch
from bark import SAMPLE_RATE, generate_audio, preload_models
import pyttsx3
from scipy.io import wavfile

# Constants
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SIZE = 1024
RECORD_SECONDS = 10
MODEL_SIZE = "base"  # or "tiny" for lower resource usage
NOISE_THRESHOLD = 0.01  # Minimum audio level to consider as speech
MAX_INPUT_LENGTH = 1000  # Maximum characters to send to LLM

class VoiceAssistant:
    def __init__(self):
        # Check for ffmpeg
        if not self._check_ffmpeg():
            raise RuntimeError("ffmpeg not found. Please install ffmpeg first (e.g., 'brew install ffmpeg' on macOS)")
            
        # Initialize Whisper model
        print("Loading Whisper model...")
        self.whisper_model = whisper.load_model(MODEL_SIZE)
        
        # Initialize text-to-speech
        print("Initializing text-to-speech...")
        try:
            preload_models()
            self.use_bark = True
        except Exception as e:
            print(f"Bark initialization failed, falling back to pyttsx3: {e}")
            self.use_bark = False
            self.tts_engine = pyttsx3.init()
        
        # Create temp directory for audio files
        self.temp_dir = tempfile.mkdtemp()
        
        # Initialize recording stream
        self.stream = None

    def _check_ffmpeg(self):
        """Check if ffmpeg is available in the system"""
        return shutil.which('ffmpeg') is not None

    def _is_silent(self, audio_data):
        """Check if audio data is below noise threshold"""
        return np.max(np.abs(audio_data)) < NOISE_THRESHOLD

    def cleanup(self):
        """Cleanup resources"""
        try:
            if self.stream is not None:
                self.stream.close()
            if not self.use_bark and hasattr(self, 'tts_engine'):
                self.tts_engine.stop()
            # Clean up temporary directory
            if os.path.exists(self.temp_dir):
                for file in os.listdir(self.temp_dir):
                    os.remove(os.path.join(self.temp_dir, file))
                os.rmdir(self.temp_dir)
        except Exception as e:
            print(f"Error during cleanup: {e}")

    def record_audio(self):
        """Record audio from microphone"""
        print("\nRecording... (Press Ctrl+C to stop)")
        try:
            audio_data = sd.rec(
                int(RECORD_SECONDS * SAMPLE_RATE),
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype=np.float32
            )
            sd.wait()
            
            # Check if audio is too quiet
            if self._is_silent(audio_data):
                print("No speech detected. Please speak louder.")
                return None
                
            return audio_data
        except KeyboardInterrupt:
            print("\nRecording stopped")
            return None
        except Exception as e:
            print(f"Error during recording: {e}")
            return None

    def transcribe_audio(self, audio_data):
        """Transcribe audio using Whisper"""
        if audio_data is None:
            return None
            
        print("Transcribing...")
        # Save audio to temporary file
        temp_audio_path = os.path.join(self.temp_dir, "temp_audio.wav")
        # Convert float32 audio to int16 for saving to wav
        audio_int16 = (audio_data * 32767).astype(np.int16)
        wavfile.write(temp_audio_path, SAMPLE_RATE, audio_int16)
        
        # Transcribe using Whisper
        result = self.whisper_model.transcribe(temp_audio_path)
        text = result["text"].strip()
        
        if not text:
            print("No speech detected in the audio.")
            return None
            
        return text

    def get_llm_response(self, prompt):
        """Get response from local LLM using Ollama"""
        print("Getting LLM response...")
        try:
            # Limit input length
            if len(prompt) > MAX_INPUT_LENGTH:
                prompt = prompt[:MAX_INPUT_LENGTH] + "..."
                
            result = subprocess.run(
                ["ollama", "run", "llama3", prompt],
                capture_output=True,
                text=True
            )
            return result.stdout.strip()
        except Exception as e:
            print(f"Error getting LLM response: {e}")
            return "I'm sorry, I couldn't process your request."

    def text_to_speech(self, text):
        """Convert text to speech using Bark or pyttsx3"""
        print("Converting to speech...")
        if self.use_bark:
            try:
                audio_array = generate_audio(text)
                sd.play(audio_array, SAMPLE_RATE)
                sd.wait()
            except Exception as e:
                print(f"Bark failed, falling back to pyttsx3: {e}")
                self.use_bark = False
                self.tts_engine = pyttsx3.init()
                self.text_to_speech(text)
        else:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()

    def run(self):
        """Main loop for the voice assistant"""
        print("Voice Assistant initialized. Press Ctrl+C to exit.")
        try:
            while True:
                try:
                    # Record audio
                    audio_data = self.record_audio()
                    if audio_data is None:
                        continue
                    
                    # Transcribe
                    text = self.transcribe_audio(audio_data)
                    if not text:
                        continue
                    
                    print(f"\nYou said: {text}")
                    
                    # Get LLM response
                    response = self.get_llm_response(text)
                    print(f"\nAssistant: {response}")
                    
                    # Convert response to speech
                    self.text_to_speech(response)
                    
                except KeyboardInterrupt:
                    print("\nExiting...")
                    break
                except Exception as e:
                    print(f"Error: {e}")
                    continue
        finally:
            self.cleanup()

if __name__ == "__main__":
    assistant = VoiceAssistant()
    try:
        assistant.run()
    except Exception as e:
        print(f"Fatal error: {e}")
    finally:
        assistant.cleanup() 