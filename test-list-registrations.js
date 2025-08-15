import dgram from 'dgram';

// Simple test to register clients and then check if list-registrations works
class SimpleSIPClient {
  constructor(username) {
    this.username = username;
    this.socket = dgram.createSocket('udp4');
    this.isRegistered = false;
    this.port = 0;

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      if (message.includes('SIP/2.0 200 OK')) {
        console.log(`✓ ${this.username} registered successfully`);
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
From: <sip:${this.username}@127.0.0.1>;tag=${Math.random().toString(36).substring(2, 8)}\r
To: <sip:${this.username}@127.0.0.1>\r
Call-ID: ${Math.random().toString(36).substring(2, 15)}@127.0.0.1\r
CSeq: 1 REGISTER\r
Contact: <sip:${this.username}@127.0.0.1:${this.port}>\r
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

async function testListRegistrations() {
  console.log('=== Test List Registrations ===');
  
  const client1 = new SimpleSIPClient('100');
  const client2 = new SimpleSIPClient('101');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Registering clients...');
  client1.register();
  client2.register();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (client1.isRegistered && client2.isRegistered) {
    console.log('✓ Both clients registered successfully');
    console.log('✓ Server should now have registrations for 100 and 101');
    console.log('✓ You can test list-registrations command in the server console');
  } else {
    console.log('✗ Registration failed');
  }
  
  client1.stop();
  client2.stop();
  console.log('Test completed');
}

testListRegistrations(); 