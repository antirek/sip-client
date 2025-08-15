#!/bin/bash

echo "Starting SIP Client (Test Mode)..."
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the project directory."
    exit 1
fi

# Set environment variables for test server
export SIP_REMOTE_HOST=127.0.0.1
export SIP_REMOTE_PORT=5060
export SIP_USERNAME=102
export SIP_PASSWORD=
export SIP_DOMAIN=127.0.0.1
export SIP_LOCAL_HOST=127.0.0.1
export SIP_AUTH_REQUIRED=false

# RTP settings
export RTP_REMOTE_HOST=127.0.0.1
export RTP_REMOTE_PORT=10000
export RTP_SAMPLE_RATE=8000
export RTP_PAYLOAD_TYPE=0

# Audio settings
export AUDIO_CODEC=PCMU
export AUDIO_SAMPLE_RATE=8000
export AUDIO_CHANNELS=1
export AUDIO_BIT_DEPTH=16
export AUDIO_FREQUENCY=440
export AUDIO_AMPLITUDE=0.3

# Call settings
export CALL_TIMEOUT=30000
export CALL_RETRY_COUNT=3
export CALL_KEEP_ALIVE=true

# Logging
export LOG_LEVEL=debug
export LOG_SIP=true
export LOG_RTP=true
export LOG_AUDIO=false

echo "Configuration:"
echo "  SIP Server: $SIP_REMOTE_HOST:$SIP_REMOTE_PORT"
echo "  SIP Username: $SIP_USERNAME"
echo "  SIP Domain: $SIP_DOMAIN"
echo "  SIP Auth Required: $SIP_AUTH_REQUIRED"
echo "  Ports: Dynamic (auto-assigned)"
echo "  Audio Frequency: $AUDIO_FREQUENCY Hz"
echo "  Log Level: $LOG_LEVEL"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start SIP client
echo "Starting SIP client..."
npm start 