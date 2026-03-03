#!/bin/bash

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip first
echo "Upgrading pip..."
python -m pip install --upgrade pip

# Function to install packages with retries
install_package() {
    local package=$1
    local max_retries=3
    local retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        echo "Installing $package (attempt $((retry_count + 1))/$max_retries)..."
        pip install --no-cache-dir $package && return 0
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $max_retries ]; then
            echo "Retrying in 5 seconds..."
            sleep 5
        fi
    done
    
    echo "Failed to install $package after $max_retries attempts"
    return 1
}

# Install packages one by one with retries
echo "Installing dependencies..."
install_package "numpy>=1.24.0"
install_package "sounddevice>=0.4.6"
install_package "openai-whisper>=20231117"
install_package "torch>=2.0.0"
install_package "bark>=0.0.1"
install_package "pyttsx3>=2.90"

# Run the voice assistant
python main.py 