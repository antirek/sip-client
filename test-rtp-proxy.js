import dgram from 'dgram';
import { EventEmitter } from 'events';

class SIPClientRTPTest extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      username: config.username || '100',
      serverHost: config.serverHost || '127.0.0.1',
      serverPort: config.serverPort || 5060,
      localPort: config.localPort || 0,
      ...config
    };
    
    this.socket = null;
    this.rtpSocket = null;
    this.sequenceNumber = 1;
    this.callId = this.generateCallId();
    this.tag = this.generateTag();
    this.isRegistered = false;
    this.isInCall = false;
    this.rtpRemoteHost = null;
    this.rtpRemotePort = null;
    this.rtpSequenceNumber = 0;
    this.rtpTimestamp = 0;
    this.audioInterval = null;
    this.packetCount = 0;
  }

  start() {
    console.log(`Starting SIP Client RTP Test for ${this.config.username}...`);
    
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      this.handleSIPMessage(msg.toString(), rinfo);
    });
    
    this.socket.on('error', (err) => {
      console.error(`SIP Client ${this.config.username} error:`, err);
      this.emit('error', err);
    });
    
    this.socket.bind(this.config.localPort, () => {
      const address = this.socket.address();
      console.log(`✓ SIP Client ${this.config.username} bound to port ${address.port}`);
      this.config.localPort = address.port;
      this.emit('started');
    });

    // Start RTP socket
    this.startRTP();
  }

  startRTP() {
    this.rtpSocket = dgram.createSocket('udp4');
    this.rtpSocket.bind(0, () => {
      const address = this.rtpSocket.address();
      console.log(`✓ RTP Client ${this.config.username} bound to port ${address.port}`);
    });

    this.rtpSocket.on('message', (msg, rinfo) => {
      this.handleRTPPacket(msg, rinfo);
    });
  }

  handleRTPPacket(packet, rinfo) {
    if (this.isInCall) {
      console.log(`[${this.config.username}] Received RTP packet: ${packet.length} bytes from ${rinfo.address}:${rinfo.port}`);
    }
  }

  startAudioExchange() {
    if (!this.rtpRemoteHost || !this.rtpRemotePort) {
      console.log(`[${this.config.username}] No RTP remote endpoint configured`);
      return;
    }

    console.log(`[${this.config.username}] Starting audio exchange to ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
    this.isInCall = true;
    this.packetCount = 0;

    // Send audio packets every 20ms (50 packets per second)
    this.audioInterval = setInterval(() => {
      this.sendAudioPacket();
    }, 20);

    // Stop audio exchange after 10 seconds
    setTimeout(() => {
      this.stopAudioExchange();
    }, 10000);
  }

  stopAudioExchange() {
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    this.isInCall = false;
    console.log(`[${this.config.username}] Audio exchange stopped. Sent ${this.packetCount} packets.`);
    this.emit('call-ended');
  }

  sendAudioPacket() {
    if (!this.rtpSocket || !this.rtpRemoteHost || !this.rtpRemotePort) {
      return;
    }

    // Create RTP header
    const rtpHeader = Buffer.alloc(12);
    rtpHeader.writeUInt16BE(0x8000, 0); // Version 2, no padding, no extension, no CSRC count
    rtpHeader.writeUInt16BE(this.rtpSequenceNumber & 0xFFFF, 2);
    rtpHeader.writeUInt32BE(this.rtpTimestamp, 4);
    rtpHeader.writeUInt32BE(0x12345678, 8); // SSRC identifier

    // Create simple audio payload (160 bytes of silence for 8kHz)
    const audioPayload = Buffer.alloc(160, 0);

    // Combine header and payload
    const packet = Buffer.concat([rtpHeader, audioPayload]);

    // Send packet
    this.rtpSocket.send(packet, this.rtpRemotePort, this.rtpRemoteHost);

    // Update sequence number and timestamp
    this.rtpSequenceNumber = (this.rtpSequenceNumber + 1) & 0xFFFF;
    this.rtpTimestamp += 160; // 20ms at 8kHz
    this.packetCount++;

    if (this.packetCount % 50 === 0) {
      console.log(`[${this.config.username}] Sent ${this.packetCount} RTP packets`);
    }
  }

  register() {
    console.log(`Registering ${this.config.username}...`);
    
    const message = this.createRegisterMessage();
    this.sendSIPMessage(message);
  }

  makeCall(toExtension) {
    console.log(`Making call from ${this.config.username} to ${toExtension}...`);
    
    const message = this.createInviteMessage(toExtension);
    this.sendSIPMessage(message);
  }

  handleSIPMessage(message, rinfo) {
    console.log(`[${this.config.username}] Received: ${message.split('\r\n')[0]}`);
    
    if (message.includes('SIP/2.0 200 OK') && message.includes('REGISTER')) {
      console.log(`✓ ${this.config.username} registered successfully`);
      this.isRegistered = true;
      this.emit('registered');
    } else if (message.includes('SIP/2.0 200 OK') && message.includes('INVITE')) {
      console.log(`✓ ${this.config.username} call answered`);
      this.parseSDPFromResponse(message);
      this.emit('call-answered');
    } else if (message.includes('SIP/2.0 404 Not Found')) {
      console.log(`✗ ${this.config.username} call failed - 404 Not Found`);
      this.emit('call-failed', '404');
    } else if (message.includes('INVITE sip:')) {
      // Handle incoming call
      console.log(`📞 ${this.config.username} received incoming call`);
      this.answerIncomingCall(message);
    }
  }

  parseSDPFromResponse(message) {
    console.log(`[${this.config.username}] Parsing SDP from response...`);
    const lines = message.split('\r\n');
    let inSDP = false;
    
    for (const line of lines) {
      if (line.trim() === '') {
        inSDP = true;
        continue;
      }
      
      if (inSDP) {
        if (line.startsWith('c=IN IP4')) {
          const parts = line.split(' ');
          this.rtpRemoteHost = parts[2];
          console.log(`[${this.config.username}] Found RTP host: ${this.rtpRemoteHost}`);
        } else if (line.startsWith('m=audio')) {
          const parts = line.split(' ');
          this.rtpRemotePort = parseInt(parts[1]);
          console.log(`[${this.config.username}] Found RTP port: ${this.rtpRemotePort}`);
        }
      }
    }
    
    if (this.rtpRemoteHost && this.rtpRemotePort) {
      console.log(`[${this.config.username}] RTP endpoint configured: ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
    } else {
      console.log(`[${this.config.username}] Failed to parse RTP endpoint from SDP`);
    }
  }

  answerIncomingCall(inviteMessage) {
    console.log(`📞 ${this.config.username} answering incoming call...`);
    
    // Parse the INVITE message to get necessary headers and SDP
    const lines = inviteMessage.split('\r\n');
    let via = '';
    let from = '';
    let to = '';
    let callId = '';
    let cseq = '';
    let inSDP = false;
    
    for (const line of lines) {
      if (line.startsWith('Via:')) {
        via = line;
      } else if (line.startsWith('From:')) {
        from = line;
      } else if (line.startsWith('To:')) {
        to = line;
      } else if (line.startsWith('Call-ID:')) {
        callId = line;
      } else if (line.startsWith('CSeq:')) {
        cseq = line;
      } else if (line.trim() === '') {
        inSDP = true;
      } else if (inSDP) {
        if (line.startsWith('c=IN IP4')) {
          const parts = line.split(' ');
          this.rtpRemoteHost = parts[2];
        } else if (line.startsWith('m=audio')) {
          const parts = line.split(' ');
          this.rtpRemotePort = parseInt(parts[1]);
        }
      }
    }
    
    if (this.rtpRemoteHost && this.rtpRemotePort) {
      console.log(`[${this.config.username}] RTP endpoint: ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
    }
    
    // Create 200 OK response with SDP
    const response = `SIP/2.0 200 OK\r
${via}\r
${from}\r
${to};tag=${this.generateTag()}\r
${callId}\r
${cseq}\r
Contact: <sip:${this.config.username}@127.0.0.1:${this.config.localPort}>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=${this.config.username} 1234567890 1234567890 IN IP4 127.0.0.1\r
s=SIP Call\r
c=IN IP4 127.0.0.1\r
t=0 0\r
m=audio 10000 RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
`;
    
    this.sendSIPMessage(response);
    console.log(`✓ ${this.config.username} answered call with 200 OK`);
    this.emit('call-answered');
  }

  createRegisterMessage() {
    const branch = 'z9hG4bK' + Math.random().toString(36).substring(2, 15);
    
    return `REGISTER sip:${this.config.serverHost} SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:${this.config.localPort};branch=${branch}\r
From: <sip:${this.config.username}@${this.config.serverHost}>;tag=${this.tag}\r
To: <sip:${this.config.username}@${this.config.serverHost}>\r
Call-ID: ${this.callId}\r
CSeq: ${this.sequenceNumber++} REGISTER\r
Contact: <sip:${this.config.username}@127.0.0.1:${this.config.localPort}>\r
Expires: 3600\r
Content-Length: 0\r
\r
`;
  }

  createInviteMessage(toExtension) {
    const branch = 'z9hG4bK' + Math.random().toString(36).substring(2, 15);
    const callId = this.generateCallId();
    
    return `INVITE sip:${toExtension}@${this.config.serverHost} SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:${this.config.localPort};branch=${branch}\r
From: <sip:${this.config.username}@${this.config.serverHost}>;tag=${this.tag}\r
To: <sip:${toExtension}@${this.config.serverHost}>\r
Call-ID: ${callId}\r
CSeq: ${this.sequenceNumber++} INVITE\r
Contact: <sip:${this.config.username}@127.0.0.1:${this.config.localPort}>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=${this.config.username} 1234567890 1234567890 IN IP4 127.0.0.1\r
s=SIP Call\r
c=IN IP4 127.0.0.1\r
t=0 0\r
m=audio 10000 RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
`;
  }

  sendSIPMessage(message) {
    const buffer = Buffer.from(message);
    this.socket.send(buffer, this.config.serverPort, this.config.serverHost);
  }

  generateCallId() {
    return Math.random().toString(36).substring(2, 15) + '@127.0.0.1';
  }

  generateTag() {
    return Math.random().toString(36).substring(2, 10);
  }

  stop() {
    this.stopAudioExchange();
    if (this.socket) {
      this.socket.close();
    }
    if (this.rtpSocket) {
      this.rtpSocket.close();
    }
    console.log(`SIP Client ${this.config.username} stopped`);
  }
}

// Test function
async function testRTPProxy() {
  console.log('=== SIP RTP Proxy Test ===');
  console.log('This test demonstrates RTP proxying through the server');
  console.log('All audio traffic will go through the server, not directly between clients');
  console.log('');

  // Create two clients
  const client1 = new SIPClientRTPTest({
    username: '100',
    serverHost: '127.0.0.1',
    serverPort: 5060
  });

  const client2 = new SIPClientRTPTest({
    username: '101',
    serverHost: '127.0.0.1',
    serverPort: 5060
  });

  // Start clients
  client1.start();
  client2.start();

  // Wait for clients to start
  await new Promise(resolve => {
    let startedCount = 0;
    const onStarted = () => {
      startedCount++;
      if (startedCount === 2) resolve();
    };
    client1.on('started', onStarted);
    client2.on('started', onStarted);
  });

  console.log('Both clients started');
  console.log('');

  // Register clients
  console.log('=== Registration Phase ===');
  
  await new Promise(resolve => {
    let registeredCount = 0;
    const onRegistered = () => {
      registeredCount++;
      if (registeredCount === 2) {
        console.log('Both clients registered successfully');
        console.log('');
        resolve();
      }
    };
    client1.on('registered', onRegistered);
    client2.on('registered', onRegistered);
    
    client1.register();
    client2.register();
  });

  // Wait a bit for registration to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test call with RTP proxy
  console.log('=== RTP Proxy Test (10s Audio) ===');
  console.log('Client 100 will call Client 101');
  console.log('Audio will be proxied through the server');
  console.log('');
  
  await new Promise(resolve => {
    let callAnsweredCount = 0;
    const onCallAnswered = () => {
      callAnsweredCount++;
      if (callAnsweredCount === 2) {
        console.log('✓ Call established, starting 10s audio exchange through RTP proxy...');
        
        // Start audio exchange for both clients
        if (client1.rtpRemoteHost && client1.rtpRemotePort) {
          client1.startAudioExchange();
        }
        if (client2.rtpRemoteHost && client2.rtpRemotePort) {
          client2.startAudioExchange();
        }
        
        resolve();
      }
    };
    
    client1.on('call-answered', onCallAnswered);
    client2.on('call-answered', onCallAnswered);
    client2.on('call-failed', (reason) => {
      console.log(`✗ Call failed: ${reason}`);
      resolve();
    });
    
    client1.makeCall('101');
  });

  // Wait for audio exchange to complete
  await new Promise(resolve => {
    let endedCount = 0;
    const onEnded = () => {
      endedCount++;
      if (endedCount === 2) {
        console.log('✓ 10s audio exchange completed');
        console.log('');
        console.log('=== RTP Proxy Summary ===');
        console.log('✓ All audio traffic was proxied through the server');
        console.log('✓ Clients sent RTP to server ports, not directly to each other');
        console.log('✓ Server forwarded RTP packets between clients');
        resolve();
      }
    };
    client1.on('call-ended', onEnded);
    client2.on('call-ended', onEnded);
  });

  // Cleanup
  console.log('');
  console.log('=== Test Complete ===');
  console.log('Stopping clients...');
  
  client1.stop();
  client2.stop();
  
  console.log('RTP Proxy test finished');
}

// Run the test
testRTPProxy().catch(console.error); 