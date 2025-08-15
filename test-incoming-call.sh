#!/bin/bash

echo "=== Testing Incoming Call ==="
echo "This script will help you test incoming calls to extension 102"
echo ""

# Check if SIP client is running
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ SIP Client is running"
    echo "📋 Process ID: $(pgrep -f 'node src/index.js')"
    echo ""
    echo "📞 To test incoming call:"
    echo "1. From another SIP client, call extension 102"
    echo "2. Or use Asterisk CLI: channel originate SIP/101 extension 102@internal"
    echo "3. Or call from a SIP phone to 102"
    echo ""
    echo "🔍 Watch for these logs:"
    echo "   - 'Incoming call detected'"
    echo "   - 'Parsing SDP: ...'"
    echo "   - 'RTP remote endpoint: ...'"
    echo "   - 'RTP handler configured: ...'"
    echo "   - 'Sending RTP packet: ...'"
    echo ""
    echo "Press Ctrl+C to stop monitoring"
    echo ""
    
    # Monitor logs in real-time
    tail -f /dev/null &
    TAIL_PID=$!
    
    trap "kill $TAIL_PID 2>/dev/null; exit" INT
    
    while true; do
        sleep 1
    done
else
    echo "❌ SIP Client is not running"
    echo "Please start it first with: ./start.sh"
    exit 1
fi 