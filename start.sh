#!/bin/bash

# SIP Client Startup Script
# Базовые параметры для подключения к SIP-серверу

echo "Starting SIP Client..."
echo "======================"

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Проверяем наличие package.json
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the project directory."
    exit 1
fi

# Устанавливаем переменные окружения для SIP-клиента
export SIP_REMOTE_HOST=localhost
export SIP_REMOTE_PORT=5060
export SIP_USERNAME=102
export SIP_PASSWORD=1234
export SIP_DOMAIN=127.0.0.1
export SIP_LOCAL_HOST=127.0.0.1
export SIP_AUTH_REQUIRED=true

# RTP настройки (порты будут выбраны динамически)
export RTP_REMOTE_HOST=localhost
export RTP_REMOTE_PORT=10000
export RTP_SAMPLE_RATE=8000
export RTP_PAYLOAD_TYPE=0

# Аудио настройки
export AUDIO_CODEC=PCMU
export AUDIO_SAMPLE_RATE=8000
export AUDIO_CHANNELS=1
export AUDIO_BIT_DEPTH=16
export AUDIO_FREQUENCY=440
export AUDIO_AMPLITUDE=0.3

# Настройки звонков
export CALL_TIMEOUT=30000
export CALL_RETRY_COUNT=3
export CALL_KEEP_ALIVE=true

# Логирование
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

# Проверяем, установлены ли зависимости
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Запускаем SIP-клиент
echo "Starting SIP client..."
npm start 