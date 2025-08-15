#!/bin/bash

# SIP Client Custom Startup Script
# Позволяет быстро изменить основные параметры

echo "SIP Client Custom Startup"
echo "========================="

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

# Запрашиваем параметры у пользователя или используем аргументы командной строки
SIP_REMOTE_HOST=${1:-127.0.0.1}
SIP_REMOTE_PORT=${2:-5060}
SIP_USERNAME=${3:-sip_client}
SIP_PASSWORD=${4:-""}
SIP_DOMAIN=${5:-localhost}
AUDIO_FREQUENCY=${6:-440}

echo "Using parameters:"
echo "  SIP Server: $SIP_REMOTE_HOST:$SIP_REMOTE_PORT"
echo "  SIP Username: $SIP_USERNAME"
echo "  SIP Domain: $SIP_DOMAIN"
echo "  Audio Frequency: $AUDIO_FREQUENCY Hz"
echo ""

# Устанавливаем переменные окружения
export SIP_LOCAL_PORT=5060
export SIP_REMOTE_HOST=$SIP_REMOTE_HOST
export SIP_REMOTE_PORT=$SIP_REMOTE_PORT
export SIP_USERNAME=$SIP_USERNAME
export SIP_PASSWORD=$SIP_PASSWORD
export SIP_DOMAIN=$SIP_DOMAIN
export SIP_LOCAL_HOST=127.0.0.1
export SIP_AUTH_REQUIRED=false

# RTP настройки
export RTP_LOCAL_PORT=10000
export RTP_REMOTE_HOST=$SIP_REMOTE_HOST
export RTP_REMOTE_PORT=10000
export RTP_SAMPLE_RATE=8000
export RTP_PAYLOAD_TYPE=0

# Аудио настройки
export AUDIO_CODEC=PCMU
export AUDIO_SAMPLE_RATE=8000
export AUDIO_CHANNELS=1
export AUDIO_BIT_DEPTH=16
export AUDIO_FREQUENCY=$AUDIO_FREQUENCY
export AUDIO_AMPLITUDE=0.3

# Настройки звонков
export CALL_TIMEOUT=30000
export CALL_RETRY_COUNT=3
export CALL_KEEP_ALIVE=true

# Логирование
export LOG_LEVEL=info
export LOG_SIP=true
export LOG_RTP=true
export LOG_AUDIO=false

# Проверяем, установлены ли зависимости
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Запускаем SIP-клиент
echo "Starting SIP client..."
npm start 