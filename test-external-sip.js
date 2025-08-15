import dgram from 'dgram';

// Test to verify external SIP phone registration and call handling
class ExternalSIPTest {
  constructor() {
    this.socket = dgram.createSocket('udp4');
    this.port = 0;
    this.registrations = new Map();

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      console.log(`[EXTERNAL] Received from ${rinfo.address}:${rinfo.port}:`);
      console.log(message.substring(0, 200) + '...');
      
      // Parse SIP message
      const lines = message.split('\r\n');
      const firstLine = lines[0];
      
      if (firstLine.startsWith('REGISTER')) {
        this.handleRegister(message, rinfo);
      } else if (firstLine.startsWith('INVITE')) {
        this.handleInvite(message, rinfo);
      } else if (firstLine.startsWith('SIP/2.0')) {
        this.handleResponse(message, rinfo);
      }
    });

    this.socket.bind(0, '0.0.0.0', () => {
      this.port = this.socket.address().port;
      console.log(`[EXTERNAL] Test client bound to port ${this.port}`);
    });
  }

  handleRegister(message, rinfo) {
    console.log(`[EXTERNAL] Handling REGISTER from ${rinfo.address}:${rinfo.port}`);
    
    // Extract username from To header
    const lines = message.split('\r\n');
    let username = null;
    for (const line of lines) {
      if (line.startsWith('To:')) {
        const match = line.match(/sip:(\d+)@/);
        if (match) {
          username = match[1];
          break;
        }
      }
    }
    
    if (username) {
      this.registrations.set(username, {
        address: rinfo.address,
        port: rinfo.port,
        timestamp: Date.now()
      });
      console.log(`[EXTERNAL] Registered ${username} -> ${rinfo.address}:${rinfo.port}`);
    }
  }

  handleInvite(message, rinfo) {
    console.log(`[EXTERNAL] Handling INVITE from ${rinfo.address}:${rinfo.port}`);
    
    // Extract target from To header
    const lines = message.split('\r\n');
    let target = null;
    for (const line of lines) {
      if (line.startsWith('To:')) {
        const match = line.match(/sip:(\d+)@/);
        if (match) {
          target = match[1];
          break;
        }
      }
    }
    
    if (target && this.registrations.has(target)) {
      console.log(`[EXTERNAL] Target ${target} is registered, sending 200 OK`);
      
      // Send 200 OK response
      const response = this.create200OK(message, rinfo);
      this.socket.send(Buffer.from(response), rinfo.port, rinfo.address);
    } else {
      console.log(`[EXTERNAL] Target ${target} is not registered, sending 404`);
      
      // Send 404 Not Found
      const response = this.create404NotFound(message, rinfo);
      this.socket.send(Buffer.from(response), rinfo.port, rinfo.address);
    }
  }

  handleResponse(message, rinfo) {
    console.log(`[EXTERNAL] Handling response from ${rinfo.address}:${rinfo.port}`);
  }

  create200OK(originalMessage, rinfo) {
    const lines = originalMessage.split('\r\n');
    const via = lines.find(line => line.startsWith('Via:')) || '';
    const from = lines.find(line => line.startsWith('From:')) || '';
    const to = lines.find(line => line.startsWith('To:')) || '';
    const callId = lines.find(line => line.startsWith('Call-ID:')) || '';
    const cseq = lines.find(line => line.startsWith('CSeq:')) || '';
    
    return `SIP/2.0 200 OK\r
${via}\r
${from}\r
${to}\r
${callId}\r
${cseq}\r
Contact: <sip:${rinfo.address}:${this.port}>\r
Content-Length: 0\r
\r
`;
  }

  create404NotFound(originalMessage, rinfo) {
    const lines = originalMessage.split('\r\n');
    const via = lines.find(line => line.startsWith('Via:')) || '';
    const from = lines.find(line => line.startsWith('From:')) || '';
    const to = lines.find(line => line.startsWith('To:')) || '';
    const callId = lines.find(line => line.startsWith('Call-ID:')) || '';
    const cseq = lines.find(line => line.startsWith('CSeq:')) || '';
    
    return `SIP/2.0 404 Not Found\r
${via}\r
${from}\r
${to}\r
${callId}\r
${cseq}\r
Content-Length: 0\r
\r
`;
  }

  stop() {
    this.socket.close();
  }
}

async function testExternalSIP() {
  console.log('=== External SIP Test ===');
  console.log('This test will monitor external SIP registrations and calls');
  console.log('Waiting for external SIP phones to register...');
  
  const test = new ExternalSIPTest();
  
  // Run for 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n=== Test Summary ===');
  console.log('Registrations:');
  for (const [username, info] of test.registrations) {
    console.log(`  ${username} -> ${info.address}:${info.port}`);
  }
  
  test.stop();
  console.log('Test completed');
}

testExternalSIP(); 