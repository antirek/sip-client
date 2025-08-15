#!/bin/bash

echo "=== Testing Incoming Call ==="
echo ""

# Check if SIP client is running
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ SIP Client is running"
    echo "📋 Process ID: $(pgrep -f 'node src/index.js')"
    echo ""
    
    # Check if SIP server is running
    if pgrep -f "node src/server.js" > /dev/null; then
        echo "✅ SIP Server is running"
        echo "📋 Process ID: $(pgrep -f 'node src/server.js')"
        echo ""
        
        echo "📞 Making test call from 101 to 102..."
        echo ""
        
        # Create a simple INVITE message
        INVITE_MSG="INVITE sip:102@127.0.0.1 SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bKtest123\r
From: <sip:101@127.0.0.1>;tag=test123\r
To: <sip:102@127.0.0.1>\r
Call-ID: test-call-$(date +%s)\r
CSeq: 1 INVITE\r
Contact: <sip:101@127.0.0.1:5060>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=101 1234567890 1234567890 IN IP4 127.0.0.1\r
s=SIP Call\r
c=IN IP4 127.0.0.1\r
t=0 0\r
m=audio 10000 RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
"
        
        # Send INVITE to SIP server
        echo "$INVITE_MSG" | nc -w 1 127.0.0.1 5060
        
        echo ""
        echo "🔍 Check the SIP client logs for:"
        echo "   - 'Incoming call detected'"
        echo "   - 'Parsing SDP: ...'"
        echo "   - 'RTP remote endpoint: ...'"
        echo "   - 'Sending RTP packet: ...'"
        echo ""
        
    else
        echo "❌ SIP Server is not running"
        echo "Please start it first with: ./start-server.sh"
    fi
else
    echo "❌ SIP Client is not running"
    echo "Please start it first with: ./start-test.sh"
fi 