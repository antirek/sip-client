import dgram from 'dgram';
import { EventEmitter } from 'events';

class SIPServer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      port: config.port || 5060,
      host: config.host || '0.0.0.0',
      ...config
    };
    
    this.socket = null;
    this.registrations = new Map(); // username -> { contact, expires }
    this.calls = new Map(); // callId -> call info
    this.sequenceNumber = 0;
  }

  start() {
    console.log(`Starting SIP Server on ${this.config.host}:${this.config.port}`);
    
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      this.handleSIPMessage(msg.toString(), rinfo);
    });
    
    this.socket.on('error', (err) => {
      console.error('SIP Server error:', err);
      this.emit('error', err);
    });
    
    this.socket.bind(this.config.port, this.config.host, () => {
      console.log(`✓ SIP Server started on port ${this.config.port}`);
      this.emit('started');
    });
  }

  handleSIPMessage(message, rinfo) {
    console.log(`Received from ${rinfo.address}:${rinfo.port}:`);
    console.log(message.substring(0, 200) + '...');
    
    const lines = message.split('\r\n');
    const firstLine = lines[0];
    
    if (firstLine.startsWith('REGISTER')) {
      this.handleRegister(message, rinfo);
    } else if (firstLine.startsWith('INVITE')) {
      this.handleInvite(message, rinfo);
    } else if (firstLine.startsWith('ACK')) {
      this.handleAck(message, rinfo);
    } else if (firstLine.startsWith('BYE')) {
      this.handleBye(message, rinfo);
    } else if (firstLine.startsWith('SIP/2.0')) {
      // Handle SIP responses (200 OK, 404 Not Found, etc.)
      this.handleSIPResponse(message, rinfo);
    } else {
      console.log(`Unhandled SIP method: ${firstLine}`);
    }
  }

  handleSIPResponse(message, rinfo) {
    console.log('Handling SIP response...');
    
    // Parse Call-ID from response
    const lines = message.split('\r\n');
    let callId = '';
    
    for (const line of lines) {
      if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
        break;
      }
    }
    
    if (callId && this.calls.has(callId)) {
      const call = this.calls.get(callId);
      console.log(`Forwarding response to caller: ${call.callerRinfo.address}:${call.callerRinfo.port}`);
      this.sendSIPMessage(message, call.callerRinfo.address, call.callerRinfo.port);
    } else {
      console.log('No call found for response or no Call-ID');
    }
  }

  handleRegister(message, rinfo) {
    console.log('Handling REGISTER request...');
    
    // Parse REGISTER message
    const lines = message.split('\r\n');
    let username = '';
    let contact = '';
    let expires = 3600;
    
    for (const line of lines) {
      if (line.startsWith('From:')) {
        const match = line.match(/sip:(\d+)@/);
        if (match) username = match[1];
      } else if (line.startsWith('Contact:')) {
        contact = line.substring(8).trim();
      } else if (line.startsWith('Expires:')) {
        expires = parseInt(line.substring(8).trim());
      }
    }
    
    if (username) {
      this.registrations.set(username, {
        contact: contact,
        expires: expires,
        timestamp: Date.now()
      });
      console.log(`✓ Registered ${username} -> ${contact}`);
    }
    
    // Send 200 OK
    const response = this.create200OK(message, rinfo);
    this.sendSIPMessage(response, rinfo.address, rinfo.port);
  }

  handleInvite(message, rinfo) {
    console.log('Handling INVITE request...');
    
    // Parse INVITE message
    const lines = message.split('\r\n');
    let to = '';
    let from = '';
    let callId = '';
    let sdp = '';
    let inSdp = false;
    
    for (const line of lines) {
      if (line.startsWith('To:')) {
        to = line.substring(3).trim();
      } else if (line.startsWith('From:')) {
        from = line.substring(5).trim();
      } else if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
      } else if (line.trim() === '') {
        inSdp = true;
      } else if (inSdp) {
        sdp += line + '\r\n';
      }
    }
    
    // Extract target extension
    const match = to.match(/sip:(\d+)@/);
    if (!match) {
      console.log('Invalid To header');
      return;
    }
    
    const targetExtension = match[1];
    console.log(`Call to extension ${targetExtension}`);
    
    // Check if extension is registered
    if (!this.registrations.has(targetExtension)) {
      console.log(`Extension ${targetExtension} not registered`);
      const response = this.create404NotFound(message, rinfo);
      this.sendSIPMessage(response, rinfo.address, rinfo.port);
      return;
    }
    
    // Store call info
    this.calls.set(callId, {
      from: from,
      to: to,
      targetExtension: targetExtension,
      callerRinfo: rinfo,
      sdp: sdp
    });
    
    // Forward INVITE to target
    const targetContact = this.registrations.get(targetExtension).contact;
    const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
    
    if (targetMatch) {
      const targetHost = targetMatch[1];
      const targetPort = parseInt(targetMatch[2]);
      
      console.log(`Forwarding INVITE to ${targetHost}:${targetPort}`);
      this.sendSIPMessage(message, targetHost, targetPort);
    }
  }

  handleAck(message, rinfo) {
    console.log('Handling ACK request...');
    // Forward ACK to target
    const lines = message.split('\r\n');
    let callId = '';
    
    for (const line of lines) {
      if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
        break;
      }
    }
    
    if (callId && this.calls.has(callId)) {
      const call = this.calls.get(callId);
      const targetContact = this.registrations.get(call.targetExtension).contact;
      const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
      
      if (targetMatch) {
        const targetHost = targetMatch[1];
        const targetPort = parseInt(targetMatch[2]);
        this.sendSIPMessage(message, targetHost, targetPort);
      }
    }
  }

  handleBye(message, rinfo) {
    console.log('Handling BYE request...');
    // Forward BYE to target
    const lines = message.split('\r\n');
    let callId = '';
    
    for (const line of lines) {
      if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
        break;
      }
    }
    
    if (callId && this.calls.has(callId)) {
      const call = this.calls.get(callId);
      const targetContact = this.registrations.get(call.targetExtension).contact;
      const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
      
      if (targetMatch) {
        const targetHost = targetMatch[1];
        const targetPort = parseInt(targetMatch[2]);
        this.sendSIPMessage(message, targetHost, targetPort);
      }
      
      this.calls.delete(callId);
    }
  }

  create200OK(originalMessage, rinfo) {
    const lines = originalMessage.split('\r\n');
    let via = '';
    let from = '';
    let to = '';
    let callId = '';
    let cseq = '';
    
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
      }
    }
    
    return `SIP/2.0 200 OK\r
${via}\r
${from}\r
${to}\r
${callId}\r
${cseq}\r
Content-Length: 0\r
\r
`;
  }

  create404NotFound(originalMessage, rinfo) {
    const lines = originalMessage.split('\r\n');
    let via = '';
    let from = '';
    let to = '';
    let callId = '';
    let cseq = '';
    
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
      }
    }
    
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

  sendSIPMessage(message, host, port) {
    const buffer = Buffer.from(message);
    this.socket.send(buffer, port, host);
    console.log(`Sent to ${host}:${port}:`);
    console.log(message.substring(0, 200) + '...');
  }

  stop() {
    if (this.socket) {
      this.socket.close();
    }
    console.log('SIP Server stopped');
  }

  // Test method to make a call
  makeCall(fromExtension, toExtension) {
    console.log(`Making test call from ${fromExtension} to ${toExtension}`);
    
    if (!this.registrations.has(toExtension)) {
      console.log(`Extension ${toExtension} not registered`);
      return;
    }
    
    const targetContact = this.registrations.get(toExtension).contact;
    const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
    
    if (targetMatch) {
      const targetHost = targetMatch[1];
      const targetPort = parseInt(targetMatch[2]);
      
      const inviteMessage = this.createTestInvite(fromExtension, toExtension);
      this.sendSIPMessage(inviteMessage, targetHost, targetPort);
    }
  }

  createTestInvite(fromExtension, toExtension) {
    const callId = Math.random().toString(36).substring(2, 15);
    const branch = 'z9hG4bK' + Math.random().toString(36).substring(2, 15);
    const tag = Math.random().toString(36).substring(2, 10);
    
    return `INVITE sip:${toExtension}@127.0.0.1 SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:5060;branch=${branch}\r
From: <sip:${fromExtension}@127.0.0.1>;tag=${tag}\r
To: <sip:${toExtension}@127.0.0.1>\r
Call-ID: ${callId}\r
CSeq: 1 INVITE\r
Contact: <sip:${fromExtension}@127.0.0.1:5060>\r
Content-Type: application/sdp\r
Content-Length: 200\r
\r
v=0\r
o=${fromExtension} 1234567890 1234567890 IN IP4 127.0.0.1\r
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
}

export default SIPServer; 