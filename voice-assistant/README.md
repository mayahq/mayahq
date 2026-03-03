# Voice Assistant

A local voice assistant that uses Whisper for speech-to-text, Ollama for local LLM processing, and Bark/pyttsx3 for text-to-speech.

## Prerequisites

- Python 3.8+
- Ollama installed and running (with llama3 model)
- macOS (Apple Silicon, M1)

## Setup

1. Create and activate a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Make sure Ollama is running and the llama3 model is installed:
```bash
ollama pull llama3
```

## Usage

Run the assistant:
```bash
./run.sh
```

The assistant will:
1. Record your voice (5 seconds at a time)
2. Transcribe it using Whisper
3. Get a response from the local LLM
4. Convert the response to speech

Press Ctrl+C to stop recording or exit the program.

## Features

- Voice recording using sounddevice
- Speech-to-text using OpenAI Whisper (base model)
- Local LLM processing using Ollama (llama3)
- Text-to-speech using Bark (with pyttsx3 fallback)
- Minimal memory usage
- Simple CLI interface

## Troubleshooting

### Installation Issues

If you encounter timeout errors during installation:

1. Try using a different Python package index:
```bash
pip install --index-url https://pypi.org/simple/ PACKAGE_NAME
```

2. If you're behind a proxy, configure pip to use it:
```bash
pip install --proxy http://proxy.server:port PACKAGE_NAME
```

3. For slow connections, increase the timeout:
```bash
pip install --timeout 100 PACKAGE_NAME
```

4. If specific packages fail to install:
   - Try installing them individually
   - Check your internet connection
   - Make sure you have enough disk space
   - Try using a different Python version

### Runtime Issues

- If you get audio device errors, make sure your microphone is properly connected and selected as the default input device
- If Whisper fails to load, try using the "tiny" model instead of "base"
- If Bark fails, the system will automatically fall back to pyttsx3

## Notes

- The assistant uses temporary files for audio processing
- Bark is used as the primary TTS engine, with pyttsx3 as fallback
- The Whisper model can be changed between "base" and "tiny" in main.py
- Recording duration can be adjusted in main.py 