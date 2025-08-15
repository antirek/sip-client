#!/bin/bash

echo "=== SIP Client Status Check ==="

# Проверяем, запущен ли процесс
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ SIP Client is running"
    
    # Получаем PID
    PID=$(pgrep -f "node src/index.js")
    echo "📋 Process ID: $PID"
    
    # Проверяем порты
    echo "🔍 Checking ports..."
    netstat -tulpn 2>/dev/null | grep $PID || echo "No ports found"
    
    # Проверяем последние логи (если доступны)
    echo "📝 Recent logs:"
    if [ -f "/proc/$PID/fd/1" ]; then
        tail -5 /proc/$PID/fd/1 2>/dev/null || echo "Cannot read logs"
    else
        echo "Logs not accessible"
    fi
    
else
    echo "❌ SIP Client is not running"
fi

echo ""
echo "=== Test Instructions ==="
echo "1. Make sure SIP client is registered (should see 'Registration successful')"
echo "2. Send a call to extension 102 from another SIP client"
echo "3. Client should automatically answer and start RTP exchange"
echo "4. Check logs for 'Incoming call detected' and 'Call answered'" 