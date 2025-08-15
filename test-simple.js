import dgram from 'dgram';

// Simple SIP client for testing
class SimpleSIPClient {
  constructor(username) {
    this.username = username;
    this.socket = dgram.createSocket('udp4');
    this.isRegistered = false;
    this.port = 0;
    
    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      console.log(`[${username}] Received: ${message.split('\r\n')[0]}`);
      
      if (message.includes('SIP/2.0 200 OK') && message.includes('REGISTER')) {
        console.log(`✓ ${username} registered successfully`);
        this.isRegistered = true;
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
  
  stop() {
    this.socket.close();
  }
}

async function testSimple() {
  console.log('=== Simple SIP Server Test ===');
  
  const client1 = new SimpleSIPClient('100');
  const client2 = new SimpleSIPClient('101');
  
  // Wait for sockets to bind
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Registering clients...');
  client1.register();
  client2.register();
  
  // Wait for registration
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (client1.isRegistered && client2.isRegistered) {
    console.log('✓ Both clients registered successfully');
    console.log('✓ Refactored SIP server is working correctly');
  } else {
    console.log('✗ Registration failed');
  }
  
  client1.stop();
  client2.stop();
  console.log('Test completed');
}

testSimple().catch(console.error); 