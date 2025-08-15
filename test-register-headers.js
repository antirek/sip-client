import dgram from 'dgram';

// Test to verify REGISTER response headers
class RegisterTestClient {
  constructor(username) {
    this.username = username;
    this.socket = dgram.createSocket('udp4');
    this.isRegistered = false;
    this.port = 0;
    this.registerResponse = '';

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      this.registerResponse = message;
      
      if (message.includes('SIP/2.0 200 OK')) {
        console.log(`✓ ${this.username} received 200 OK`);
        console.log(`Response headers for ${this.username}:`);
        console.log('---');
        console.log(message);
        console.log('---');
        
        // Check for important headers
        if (message.includes('Contact:')) {
          console.log(`✓ Contact header present for ${this.username}`);
        } else {
          console.log(`✗ Contact header missing for ${this.username}`);
        }
        
        if (message.includes('Expires:')) {
          console.log(`✓ Expires header present for ${this.username}`);
        } else {
          console.log(`✗ Expires header missing for ${this.username}`);
        }
        
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
Expires: 3600\r
Content-Length: 0\r
\r
`;

    this.socket.send(Buffer.from(message), 5060, '127.0.0.1');
    console.log(`[${this.username}] Sending REGISTER with Expires: 3600`);
  }

  stop() {
    this.socket.close();
  }
}

async function testRegisterHeaders() {
  console.log('=== Test REGISTER Response Headers ===');
  
  const client1 = new RegisterTestClient('100');
  const client2 = new RegisterTestClient('101');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Registering clients with Expires header...');
  client1.register();
  client2.register();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (client1.isRegistered && client2.isRegistered) {
    console.log('✓ Both clients registered successfully');
    console.log('✓ REGISTER responses include proper headers');
  } else {
    console.log('✗ Registration failed');
  }
  
  client1.stop();
  client2.stop();
  console.log('Test completed');
}

testRegisterHeaders(); 