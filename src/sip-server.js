import dgram from 'dgram';
import { EventEmitter } from 'events';

class SIPServer extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      port: config.port || 5060,
      host: config.host || '0.0.0.0',
      rtpPort: config.rtpPort || 10000,
      ...config
    };
    this.socket = null;
    this.rtpSocket = null;
    this.registrations = new Map(); // username -> { contact, expires }
    this.calls = new Map(); // callId -> call info
    this.rtpProxies = new Map(); // callId -> { client1, client2, rtpPort }
    this.sequenceNumber = 0;
    this.rtpPortCounter = 10000;
  }

  start() {
    console.log(`Starting SIP Server on ${this.config.host}:${this.config.port}`);
    
    // Start SIP socket
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

    // Start RTP socket for proxying
    this.startRTPProxy();
  }

  startRTPProxy() {
    this.rtpSocket = dgram.createSocket('udp4');
    
    this.rtpSocket.on('message', (msg, rinfo) => {
      this.handleRTPPacket(msg, rinfo);
    });
    
    this.rtpSocket.on('error', (err) => {
      console.error('RTP Server error:', err);
    });
    
    this.rtpSocket.bind(this.config.rtpPort, this.config.host, () => {
      console.log(`✓ RTP Proxy started on port ${this.config.rtpPort}`);
    });
  }

  handleRTPPacket(packet, rinfo) {
    // Find which call this RTP packet belongs to
    for (const [callId, proxy] of this.rtpProxies) {
      // Check if packet is from client1 to server
      if (rinfo.port === proxy.client1.rtpPort && rinfo.address === proxy.client1.rtpHost) {
        // Forward from server to client2
        this.rtpSocket.send(packet, proxy.client2.rtpPort, proxy.client2.rtpHost);
        console.log(`RTP: ${proxy.client1.username} -> ${proxy.client2.username} (${packet.length} bytes)`);
        return;
      } else if (rinfo.port === proxy.client2.rtpPort && rinfo.address === proxy.client2.rtpHost) {
        // Forward from server to client1
        this.rtpSocket.send(packet, proxy.client1.rtpPort, proxy.client1.rtpHost);
        console.log(`RTP: ${proxy.client2.username} -> ${proxy.client1.username} (${packet.length} bytes)`);
        return;
      }
    }
  }

  createRTPProxy(callId, client1, client2) {
    // Assign RTP ports for this call on the server
    const rtpPort1 = this.rtpPortCounter++;
    const rtpPort2 = this.rtpPortCounter++;
    
    const proxy = {
      client1: {
        username: client1.username,
        rtpHost: client1.rtpHost, // Client's actual IP
        rtpPort: client1.rtpPort  // Client's actual RTP port
      },
      client2: {
        username: client2.username,
        rtpHost: client2.rtpHost, // Client's actual IP
        rtpPort: client2.rtpPort  // Client's actual RTP port
      },
      serverPort1: rtpPort1, // Server port for client1
      serverPort2: rtpPort2  // Server port for client2
    };
    
    this.rtpProxies.set(callId, proxy);
    console.log(`✓ RTP Proxy created for call ${callId}: ${client1.username} <-> ${client2.username}`);
    console.log(`  ${client1.username}: ${client1.rtpHost}:${client1.rtpPort} -> ${this.config.host}:${rtpPort1}`);
    console.log(`  ${client2.username}: ${client2.rtpHost}:${client2.rtpPort} -> ${this.config.host}:${rtpPort2}`);
    
    return proxy;
  }

  removeRTPProxy(callId) {
    if (this.rtpProxies.has(callId)) {
      const proxy = this.rtpProxies.get(callId);
      console.log(`✓ RTP Proxy removed for call ${callId}: ${proxy.client1.username} <-> ${proxy.client2.username}`);
      this.rtpProxies.delete(callId);
    }
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
    let sdp = '';
    let inSdp = false;
    
    for (const line of lines) {
      if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
      } else if (line.trim() === '') {
        inSdp = true;
      } else if (inSdp) {
        sdp += line + '\r\n';
      }
    }
    
    if (callId && this.calls.has(callId)) {
      const call = this.calls.get(callId);
      
      // If this is a 200 OK with SDP, modify it for RTP proxy
      if (message.includes('SIP/2.0 200 OK') && sdp.trim()) {
        console.log(`Modifying 200 OK SDP for call ${callId}`);
        
        // Parse target's SDP
        const targetSDP = this.parseSDP(sdp);
        
        // Update RTP proxy with target's endpoint
        if (this.rtpProxies.has(callId)) {
          const proxy = this.rtpProxies.get(callId);
          proxy.client2.rtpHost = rinfo.address;
          proxy.client2.rtpPort = targetSDP.rtpPort;
          console.log(`Updated RTP proxy: ${proxy.client2.username} -> ${rinfo.address}:${targetSDP.rtpPort}`);
        }
        
        // Modify SDP to use server's RTP ports
        const modifiedSDP = this.modifySDPForProxy(sdp, this.rtpProxies.get(callId), 'target');
        
        // Create modified response
        const modifiedResponse = this.modifySIPMessage(message, modifiedSDP);
        
        console.log(`Forwarding modified 200 OK to caller: ${call.callerRinfo.address}:${call.callerRinfo.port}`);
        this.sendSIPMessage(modifiedResponse, call.callerRinfo.address, call.callerRinfo.port);
      } else {
        // Forward other responses as-is
        console.log(`Forwarding response to caller: ${call.callerRinfo.address}:${call.callerRinfo.port}`);
        this.sendSIPMessage(message, call.callerRinfo.address, call.callerRinfo.port);
      }
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
    
    // Extract caller extension
    const fromMatch = from.match(/sip:(\d+)@/);
    if (!fromMatch) {
      console.log('Invalid From header');
      return;
    }
    const callerExtension = fromMatch[1];
    
    // Parse caller's SDP to get their RTP endpoint
    const callerSDP = this.parseSDP(sdp);
    
    // Store call info
    this.calls.set(callId, {
      from: from,
      to: to,
      targetExtension: targetExtension,
      callerExtension: callerExtension,
      callerRinfo: rinfo,
      callerSDP: callerSDP,
      sdp: sdp
    });
    
    // Create RTP proxy for this call
    const client1 = {
      username: callerExtension,
      rtpHost: rinfo.address,
      rtpPort: callerSDP.rtpPort || 10000
    };
    
    const client2 = {
      username: targetExtension,
      rtpHost: rinfo.address, // Will be updated when target responds
      rtpPort: 10000 // Will be updated when target responds
    };
    
    const rtpProxy = this.createRTPProxy(callId, client1, client2);
    
    // Modify SDP to use server's RTP ports
    const modifiedSDP = this.modifySDPForProxy(sdp, rtpProxy, 'caller');
    
    // Create modified INVITE with server's RTP ports
    const modifiedInvite = this.modifySIPMessage(message, modifiedSDP);
    
    // Forward INVITE to target
    const targetContact = this.registrations.get(targetExtension).contact;
    const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
    
    if (targetMatch) {
      const targetHost = targetMatch[1];
      const targetPort = parseInt(targetMatch[2]);
      
      console.log(`Forwarding INVITE to ${targetHost}:${targetPort}`);
      this.sendSIPMessage(modifiedInvite, targetHost, targetPort);
    }
  }

  parseSDP(sdp) {
    const lines = sdp.split('\r\n');
    let rtpHost = '127.0.0.1';
    let rtpPort = 10000;
    
    for (const line of lines) {
      if (line.startsWith('c=IN IP4')) {
        const parts = line.split(' ');
        rtpHost = parts[2];
      } else if (line.startsWith('m=audio')) {
        const parts = line.split(' ');
        rtpPort = parseInt(parts[1]);
      }
    }
    
    return { rtpHost, rtpPort };
  }

  modifySDPForProxy(sdp, rtpProxy, direction) {
    const lines = sdp.split('\r\n');
    const modifiedLines = [];
    
    for (const line of lines) {
      if (line.startsWith('c=IN IP4')) {
        // Change IP to server's IP (use 127.0.0.1 for local testing)
        const serverIP = this.config.host === '0.0.0.0' ? '127.0.0.1' : this.config.host;
        modifiedLines.push(`c=IN IP4 ${serverIP}`);
      } else if (line.startsWith('m=audio')) {
        // Change port to server's RTP port
        const parts = line.split(' ');
        const serverPort = direction === 'caller' ? rtpProxy.serverPort1 : rtpProxy.serverPort2;
        modifiedLines.push(`m=audio ${serverPort} RTP/AVP 0 8 101`);
      } else {
        modifiedLines.push(line);
      }
    }
    
    return modifiedLines.join('\r\n') + '\r\n';
  }

  modifySIPMessage(message, newSDP) {
    const lines = message.split('\r\n');
    const headerLines = [];
    let inBody = false;
    
    for (const line of lines) {
      if (line.trim() === '') {
        inBody = true;
        break;
      }
      if (line.startsWith('Content-Length:')) {
        // Update content length
        headerLines.push(`Content-Length: ${newSDP.length}`);
      } else {
        headerLines.push(line);
      }
    }
    
    return headerLines.join('\r\n') + '\r\n\r\n' + newSDP;
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
      
      // Remove RTP proxy for this call
      this.removeRTPProxy(callId);
      
      const targetContact = this.registrations.get(call.targetExtension).contact;
      const targetMatch = targetContact.match(/sip:\d+@([^:]+):(\d+)/);
      
      if (targetMatch) {
        const targetHost = targetMatch[1];
        const targetPort = parseInt(targetMatch[2]);
        this.sendSIPMessage(message, targetHost, targetPort);
      }
      
      // Clean up call info
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
    if (this.rtpSocket) {
      this.rtpSocket.close();
    }
    
    // Clean up all RTP proxies
    for (const [callId, proxy] of this.rtpProxies) {
      console.log(`Cleaning up RTP proxy for call ${callId}`);
    }
    this.rtpProxies.clear();
    
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