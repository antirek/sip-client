import dgram from 'dgram';

// Simple SIP client for testing calls between 100 and 101
class CallTestClient {
  constructor(username) {
    this.username = username;
    this.socket = dgram.createSocket('udp4');
    this.isRegistered = false;
    this.port = 0;
    this.receivedInvite = false;
    this.callAnswered = false;
    
    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      console.log(`[${username}] Received: ${message.split('\r\n')[0]}`);
      
      if (message.includes('SIP/2.0 200 OK') && message.includes('REGISTER')) {
        console.log(`✓ ${username} registered successfully`);
        this.isRegistered = true;
      } else if (message.includes('INVITE sip:')) {
        console.log(`📞 ${username} received INVITE`);
        this.receivedInvite = true;
        this.answerCall(message);
      } else if (message.includes('SIP/2.0 200 OK') && message.includes('INVITE')) {
        console.log(`✓ ${username} call answered`);
        this.callAnswered = true;
      } else if (message.includes('SIP/2.0 404 Not Found')) {
        console.log(`✗ ${username} call failed - 404 Not Found`);
      }
    });
    
    this.socket.bind(0, () => {
      this.port = this.socket.address().port;
      console.log(`[${username}] Bound to port ${this.port}`);
    });
  }
  
  register() {
    const message = `REGISTER sip:127.0.0.1 SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:${this.port};branch=z9hG4bK${Math.random().toString(36).substring(2, 15)}\r
From: <sip:${this.username}@127.0.0.1>;tag=${Math.random().toString(36).substring(2, 10)}\r
To: <sip:${this.username}@127.0.0.1>\r
Call-ID: ${Math.random().toString(36).substring(2, 15)}@127.0.0.1\r
CSeq: 1 REGISTER\r
Contact: <sip:${this.username}@127.0.0.1:${this.port}>\r
Expires: 3600\r
Content-Length: 0\r
\r
`;
    
    this.socket.send(Buffer.from(message), 5060, '127.0.0.1');
    console.log(`[${this.username}] Sending REGISTER`);
  }
  
  makeCall(toExtension) {
    const callId = Math.random().toString(36).substring(2, 15);
    const message = `INVITE sip:${toExtension}@127.0.0.1 SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:${this.port};branch=z9hG4bK${Math.random().toString(36).substring(2, 15)}\r
From: <sip:${this.username}@127.0.0.1>;tag=${Math.random().toString(36).substring(2, 10)}\r
To: <sip:${toExtension}@127.0.0.1>\r
Call-ID: ${callId}@127.0.0.1\r
CSeq: 1 INVITE\r
Contact: <sip:${this.username}@127.0.0.1:${this.port}>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=${this.username} 1234567890 1234567890 IN IP4 127.0.0.1\r
s=SIP Call\r
c=IN IP4 127.0.0.1\r
t=0 0\r
m=audio 10000 RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
`;
    
    this.socket.send(Buffer.from(message), 5060, '127.0.0.1');
    console.log(`[${this.username}] Making call to ${toExtension}`);
  }
  
  answerCall(inviteMessage) {
    // Parse INVITE to get headers
    const lines = inviteMessage.split('\r\n');
    let via = '';
    let from = '';
    let to = '';
    let callId = '';
    let cseq = '';
    
    for (const line of lines) {
      if (line.startsWith('Via:')) via = line;
      else if (line.startsWith('From:')) from = line;
      else if (line.startsWith('To:')) to = line;
      else if (line.startsWith('Call-ID:')) callId = line;
      else if (line.startsWith('CSeq:')) cseq = line;
    }
    
    const response = `SIP/2.0 200 OK\r
${via}\r
${from}\r
${to};tag=${Math.random().toString(36).substring(2, 10)}\r
${callId}\r
${cseq}\r
Contact: <sip:${this.username}@127.0.0.1:${this.port}>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=${this.username} 1234567890 1234567890 IN IP4 127.0.0.1\r
s=SIP Call\r
c=IN IP4 127.0.0.1\r
t=0 0\r
m=audio 10001 RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
`;
    
    this.socket.send(Buffer.from(response), 5060, '127.0.0.1');
    console.log(`[${this.username}] Answered call with 200 OK`);
  }
  
  stop() {
    this.socket.close();
  }
}

async function testCalls100101() {
  console.log('=== Test Calls Between 100 and 101 ===');
  
  const client100 = new CallTestClient('100');
  const client101 = new CallTestClient('101');
  
  // Wait for sockets to bind
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Registering clients...');
  client100.register();
  client101.register();
  
  // Wait for registration
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (!client100.isRegistered || !client101.isRegistered) {
    console.log('✗ Registration failed');
    return;
  }
  
  console.log('✓ Both clients registered successfully');
  
  // Test 1: 100 calls 101
  console.log('\n--- Test 1: 100 calls 101 ---');
  client100.makeCall('101');
  
  // Wait for call processing
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  if (client101.receivedInvite && client100.callAnswered) {
    console.log('✓ Call from 100 to 101: SUCCESS');
  } else {
    console.log('✗ Call from 100 to 101: FAILED');
  }
  
  // Reset flags
  client100.receivedInvite = false;
  client100.callAnswered = false;
  client101.receivedInvite = false;
  client101.callAnswered = false;
  
  // Test 2: 101 calls 100
  console.log('\n--- Test 2: 101 calls 100 ---');
  client101.makeCall('100');
  
  // Wait for call processing
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  if (client100.receivedInvite && client101.callAnswered) {
    console.log('✓ Call from 101 to 100: SUCCESS');
  } else {
    console.log('✗ Call from 101 to 100: FAILED');
  }
  
  // Test 3: 100 calls non-existent 999
  console.log('\n--- Test 3: 100 calls 999 (should fail) ---');
  client100.makeCall('999');
  
  // Wait for call processing
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('✓ Test completed');
  
  client100.stop();
  client101.stop();
}

testCalls100101().catch(console.error); 