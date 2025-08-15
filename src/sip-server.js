import dgram from 'dgram';
import { EventEmitter } from 'events';

// SIP Message Parser
class SIPMessageParser {
  static parse(message) {
    const lines = message.split('\r\n');
    const headers = {};
    let body = '';
    let inBody = false;
    
    for (const line of lines) {
      if (line.trim() === '') {
        inBody = true;
        continue;
      }
      
      if (inBody) {
        body += line + '\r\n';
      } else {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
    }
    
    return { headers, body: body.trim() };
  }
  
  static extractCallId(headers) {
    return headers['Call-ID'] || '';
  }
  
  static extractExtension(toHeader) {
    const match = toHeader.match(/sip:(\d+)@/);
    return match ? match[1] : null;
  }
  
  static extractContact(contactHeader) {
    const match = contactHeader.match(/sip:\d+@([^:]+):(\d+)/);
    return match ? { host: match[1], port: parseInt(match[2]) } : null;
  }
}

// SDP Parser and Modifier
class SDPHandler {
  static parse(sdp) {
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
  
  static modifyForProxy(sdp, rtpProxy, direction, serverIP) {
    const lines = sdp.split('\r\n');
    const modifiedLines = [];
    
    for (const line of lines) {
      if (line.startsWith('c=IN IP4')) {
        modifiedLines.push(`c=IN IP4 ${serverIP}`);
      } else if (line.startsWith('m=audio')) {
        const serverPort = direction === 'caller' ? rtpProxy.serverPort1 : rtpProxy.serverPort2;
        modifiedLines.push(`m=audio ${serverPort} RTP/AVP 0 8 101`);
      } else {
        modifiedLines.push(line);
      }
    }
    
    return modifiedLines.join('\r\n') + '\r\n';
  }
  
  static updateContentLength(message, newSDP) {
    const lines = message.split('\r\n');
    const headerLines = [];
    
    for (const line of lines) {
      if (line.trim() === '') break;
      
      if (line.startsWith('Content-Length:')) {
        headerLines.push(`Content-Length: ${newSDP.length}`);
      } else {
        headerLines.push(line);
      }
    }
    
    return headerLines.join('\r\n') + '\r\n\r\n' + newSDP;
  }
}

// RTP Proxy Manager
class RTPProxyManager {
  constructor(serverIP) {
    this.serverIP = serverIP;
    this.proxies = new Map();
    this.portCounter = 10000;
  }
  
  createProxy(callId, client1, client2) {
    const rtpPort1 = this.portCounter++;
    const rtpPort2 = this.portCounter++;
    
    const proxy = {
      client1: {
        username: client1.username,
        rtpHost: client1.rtpHost,
        rtpPort: client1.rtpPort
      },
      client2: {
        username: client2.username,
        rtpHost: client2.rtpHost,
        rtpPort: client2.rtpPort
      },
      serverPort1: rtpPort1,
      serverPort2: rtpPort2
    };
    
    this.proxies.set(callId, proxy);
    
    console.log(`✓ RTP Proxy created for call ${callId}: ${client1.username} <-> ${client2.username}`);
    console.log(`  ${client1.username}: ${client1.rtpHost}:${client1.rtpPort} -> ${this.serverIP}:${rtpPort1}`);
    console.log(`  ${client2.username}: ${client2.rtpHost}:${client2.rtpPort} -> ${this.serverIP}:${rtpPort2}`);
    
    return proxy;
  }
  
  getProxy(callId) {
    return this.proxies.get(callId);
  }
  
  updateProxy(callId, client2Info) {
    const proxy = this.proxies.get(callId);
    if (proxy) {
      proxy.client2.rtpHost = client2Info.rtpHost;
      proxy.client2.rtpPort = client2Info.rtpPort;
      console.log(`Updated RTP proxy: ${proxy.client2.username} -> ${client2Info.rtpHost}:${client2Info.rtpPort}`);
    }
    return proxy;
  }
  
  removeProxy(callId) {
    if (this.proxies.has(callId)) {
      const proxy = this.proxies.get(callId);
      console.log(`✓ RTP Proxy removed for call ${callId}: ${proxy.client1.username} <-> ${proxy.client2.username}`);
      this.proxies.delete(callId);
    }
  }
  
  handleRTPPacket(packet, rinfo, rtpSocket) {
    for (const [callId, proxy] of this.proxies) {
      if (rinfo.port === proxy.client1.rtpPort && rinfo.address === proxy.client1.rtpHost) {
        rtpSocket.send(packet, proxy.client2.rtpPort, proxy.client2.rtpHost);
        console.log(`RTP: ${proxy.client1.username} -> ${proxy.client2.username} (${packet.length} bytes)`);
        return;
      } else if (rinfo.port === proxy.client2.rtpPort && rinfo.address === proxy.client2.rtpHost) {
        rtpSocket.send(packet, proxy.client1.rtpPort, proxy.client1.rtpHost);
        console.log(`RTP: ${proxy.client2.username} -> ${proxy.client1.username} (${packet.length} bytes)`);
        return;
      }
    }
  }
  
  cleanup() {
    for (const [callId, proxy] of this.proxies) {
      console.log(`Cleaning up RTP proxy for call ${callId}`);
    }
    this.proxies.clear();
  }
}

// Registration Manager
class RegistrationManager {
  constructor() {
    this.registrations = new Map();
  }
  
  register(username, contact, expiresSeconds = 3600) {
    console.log(`[RegistrationManager] Registering ${username} -> ${contact} (expires: ${expiresSeconds}s)`);
    this.registrations.set(username, {
      contact,
      expires: Date.now() + (expiresSeconds * 1000) // Convert seconds to milliseconds
    });
    console.log(`✓ Registered ${username} -> ${contact} (expires: ${expiresSeconds}s)`);
    console.log(`[RegistrationManager] Current registrations:`, Array.from(this.registrations.entries()));
  }
  
  isRegistered(username) {
    return this.registrations.has(username);
  }
  
  getContact(username) {
    const reg = this.registrations.get(username);
    console.log(`[RegistrationManager] Getting contact for ${username}:`, reg);
    return reg ? reg.contact : null;
  }
  
  getRegistrations() {
    return this.registrations;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [username, reg] of this.registrations) {
      if (reg.expires < now) {
        this.registrations.delete(username);
        console.log(`Registration expired for ${username}`);
      }
    }
  }
}

// Call Manager
class CallManager {
  constructor() {
    this.calls = new Map();
  }
  
  createCall(callId, from, to, targetExtension, callerExtension, callerRinfo, callerSDP, sdp) {
    this.calls.set(callId, {
      from,
      to,
      targetExtension,
      callerExtension,
      callerRinfo,
      callerSDP,
      sdp
    });
  }
  
  getCall(callId) {
    return this.calls.get(callId);
  }
  
  removeCall(callId) {
    this.calls.delete(callId);
  }
}

// SIP Response Builder
class SIPResponseBuilder {
  static create200OK(requestHeaders, contact) {
    const via = requestHeaders['Via'];
    const from = requestHeaders['From'];
    const to = requestHeaders['To'];
    const callId = requestHeaders['Call-ID'];
    const cseq = requestHeaders['CSeq'];
    
    // Check if this is a REGISTER request
    const isRegister = cseq && cseq.includes('REGISTER');
    
    let response = `SIP/2.0 200 OK\r
Via: ${via}\r
From: ${from}\r
To: ${to}\r
Call-ID: ${callId}\r
CSeq: ${cseq}\r
`;
    
    if (isRegister) {
      // For REGISTER, include Contact and Expires headers
      response += `Contact: ${contact}\r
Expires: 3600\r
`;
    } else {
      // For other requests, include Contact header
      response += `Contact: ${contact}\r
`;
    }
    
    response += `Content-Length: 0\r
\r
`;
    
    return response;
  }
  
  static create404NotFound(requestHeaders) {
    const via = requestHeaders['Via'];
    const from = requestHeaders['From'];
    const to = requestHeaders['To'];
    const callId = requestHeaders['Call-ID'];
    const cseq = requestHeaders['CSeq'];
    
    return `SIP/2.0 404 Not Found\r
Via: ${via}\r
From: ${from}\r
To: ${to}\r
Call-ID: ${callId}\r
CSeq: ${cseq}\r
Content-Length: 0\r
\r
`;
  }
}

// Main SIP Server Class
class SIPServer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      port: config.port || 5060,
      host: config.host || '0.0.0.0',
      rtpPort: config.rtpPort || 10000,
      ...config
    };
    
    this.serverIP = this.config.host === '0.0.0.0' ? '127.0.0.1' : this.config.host;
    
    // Initialize managers
    this.registrationManager = new RegistrationManager();
    this.callManager = new CallManager();
    this.rtpProxyManager = new RTPProxyManager(this.serverIP);
    
    // Backward compatibility - expose registrations directly
    Object.defineProperty(this, 'registrations', {
      get: () => this.registrationManager.getRegistrations()
    });
    
    // Network sockets
    this.sipSocket = null;
    this.rtpSocket = null;
    
    // Cleanup interval
    this.cleanupInterval = null;
  }

  start() {
    console.log(`Starting SIP Server on ${this.config.host}:${this.config.port}`);
    
    this.startSIPSocket();
    this.startRTPSocket();
    this.startCleanupInterval();
    
    this.emit('started');
  }

  startSIPSocket() {
    this.sipSocket = dgram.createSocket('udp4');
    
    this.sipSocket.on('message', (msg, rinfo) => {
      this.handleSIPMessage(msg.toString(), rinfo);
    });
    
    this.sipSocket.on('error', (err) => {
      console.error('SIP Server error:', err);
      this.emit('error', err);
    });
    
    this.sipSocket.bind(this.config.port, this.config.host, () => {
      console.log(`✓ SIP Server started on port ${this.config.port}`);
    });
  }

  startRTPSocket() {
    this.rtpSocket = dgram.createSocket('udp4');
    
    this.rtpSocket.on('message', (msg, rinfo) => {
      this.rtpProxyManager.handleRTPPacket(msg, rinfo, this.rtpSocket);
    });
    
    this.rtpSocket.on('error', (err) => {
      console.error('RTP Server error:', err);
    });
    
    this.rtpSocket.bind(this.config.rtpPort, this.config.host, () => {
      console.log(`✓ RTP Proxy started on port ${this.config.rtpPort}`);
    });
  }

  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.registrationManager.cleanup();
    }, 60000); // Cleanup every minute
  }

  handleSIPMessage(message, rinfo) {
    const { headers, body } = SIPMessageParser.parse(message);
    const firstLine = message.split('\r\n')[0];
    
    if (firstLine.startsWith('REGISTER')) {
      this.handleRegister(headers, rinfo);
    } else if (firstLine.startsWith('INVITE')) {
      this.handleInvite(headers, body, rinfo, message);
    } else if (firstLine.startsWith('ACK')) {
      this.handleAck(headers, rinfo, message);
    } else if (firstLine.startsWith('BYE')) {
      this.handleBye(headers, rinfo, message);
    } else if (firstLine.startsWith('SIP/2.0')) {
      this.handleSIPResponse(message, rinfo);
    } else {
      console.log(`Unhandled SIP method: ${firstLine}`);
    }
  }

  handleRegister(headers, rinfo) {
    console.log('Handling REGISTER request...');
    
    const username = SIPMessageParser.extractExtension(headers['To']);
    const contact = `<sip:${username}@${rinfo.address}:${rinfo.port}>`;
    
    // Parse Expires header if present
    let expires = 3600; // Default 1 hour
    if (headers['Expires']) {
      const expiresValue = parseInt(headers['Expires']);
      if (!isNaN(expiresValue)) {
        expires = expiresValue;
      }
    }
    
    this.registrationManager.register(username, contact, expires);
    
    const response = SIPResponseBuilder.create200OK(headers, contact);
    this.sendSIPMessage(response, rinfo.address, rinfo.port);
  }

  handleInvite(headers, body, rinfo, message) {
    console.log('Handling INVITE request...');
    
    const targetExtension = SIPMessageParser.extractExtension(headers['To']);
    const callerExtension = SIPMessageParser.extractExtension(headers['From']);
    const callId = SIPMessageParser.extractCallId(headers);
    
    if (!targetExtension || !callerExtension) {
      console.log('Invalid To or From header');
      return;
    }
    
    console.log(`Call to extension ${targetExtension}`);
    
    if (!this.registrationManager.isRegistered(targetExtension)) {
      console.log(`Extension ${targetExtension} not registered`);
      const response = SIPResponseBuilder.create404NotFound(headers);
      this.sendSIPMessage(response, rinfo.address, rinfo.port);
      return;
    }
    
    // Parse caller's SDP
    const callerSDP = SDPHandler.parse(body);
    
    // Store call info
    this.callManager.createCall(callId, headers['From'], headers['To'], 
                               targetExtension, callerExtension, rinfo, callerSDP, body);
    
    // Create RTP proxy
    const client1 = {
      username: callerExtension,
      rtpHost: rinfo.address,
      rtpPort: callerSDP.rtpPort || 10000
    };
    
    const client2 = {
      username: targetExtension,
      rtpHost: rinfo.address,
      rtpPort: 10000
    };
    
    const rtpProxy = this.rtpProxyManager.createProxy(callId, client1, client2);
    
    // Modify SDP and forward INVITE
    const modifiedSDP = SDPHandler.modifyForProxy(body, rtpProxy, 'caller', this.serverIP);
    const modifiedInvite = SDPHandler.updateContentLength(message, modifiedSDP);
    
    const targetContact = this.registrationManager.getContact(targetExtension);
    console.log(`Target contact for ${targetExtension}: ${targetContact}`);
    
    const targetInfo = SIPMessageParser.extractContact(targetContact);
    console.log(`Extracted target info:`, targetInfo);
    
    if (targetInfo) {
      console.log(`Forwarding INVITE to ${targetInfo.host}:${targetInfo.port}`);
      this.sendSIPMessage(modifiedInvite, targetInfo.host, targetInfo.port);
    } else {
      console.log(`Failed to extract target info from contact: ${targetContact}`);
    }
  }

  handleSIPResponse(message, rinfo) {
    console.log('Handling SIP response...');
    
    const { headers, body } = SIPMessageParser.parse(message);
    const callId = SIPMessageParser.extractCallId(headers);
    const call = this.callManager.getCall(callId);
    
    if (!call) {
      console.log('No call found for response');
      return;
    }
    
    // Handle 200 OK with SDP
    if (message.includes('SIP/2.0 200 OK') && body.trim()) {
      console.log(`Modifying 200 OK SDP for call ${callId}`);
      
      const targetSDP = SDPHandler.parse(body);
      const rtpProxy = this.rtpProxyManager.updateProxy(callId, {
        rtpHost: rinfo.address,
        rtpPort: targetSDP.rtpPort
      });
      
      if (rtpProxy) {
        const modifiedSDP = SDPHandler.modifyForProxy(body, rtpProxy, 'target', this.serverIP);
        const modifiedResponse = SDPHandler.updateContentLength(message, modifiedSDP);
        
        console.log(`Forwarding modified 200 OK to caller: ${call.callerRinfo.address}:${call.callerRinfo.port}`);
        this.sendSIPMessage(modifiedResponse, call.callerRinfo.address, call.callerRinfo.port);
      }
    } else {
      // Forward other responses as-is
      console.log(`Forwarding response to caller: ${call.callerRinfo.address}:${call.callerRinfo.port}`);
      this.sendSIPMessage(message, call.callerRinfo.address, call.callerRinfo.port);
    }
  }

  handleAck(headers, rinfo, message) {
    console.log('Handling ACK request...');
    console.log(`[ACK] Forwarding ACK from ${rinfo.address}:${rinfo.port}`);
    // Forward ACK to target
    const callId = SIPMessageParser.extractCallId(headers);
    const call = this.callManager.getCall(callId);
    
    if (call) {
      const targetContact = this.registrationManager.getContact(call.targetExtension);
      const targetInfo = SIPMessageParser.extractContact(targetContact);
      
      if (targetInfo) {
        console.log(`[ACK] Forwarding to ${targetInfo.host}:${targetInfo.port}`);
        this.sendSIPMessage(message, targetInfo.host, targetInfo.port);
      } else {
        console.log(`[ACK] Failed to extract target info for call ${callId}`);
      }
    } else {
      console.log(`[ACK] Call not found for Call-ID: ${callId}`);
    }
  }

  handleBye(headers, rinfo, message) {
    console.log('Handling BYE request...');
    console.log(`[BYE] Processing BYE from ${rinfo.address}:${rinfo.port}`);
    
    const callId = SIPMessageParser.extractCallId(headers);
    const call = this.callManager.getCall(callId);
    
    if (call) {
      console.log(`[BYE] Found call ${callId}, removing RTP proxy`);
      // Remove RTP proxy
      this.rtpProxyManager.removeProxy(callId);
      
      // Forward BYE to target
      const targetContact = this.registrationManager.getContact(call.targetExtension);
      const targetInfo = SIPMessageParser.extractContact(targetContact);
      
      if (targetInfo) {
        console.log(`[BYE] Forwarding to ${targetInfo.host}:${targetInfo.port}`);
        this.sendSIPMessage(message, targetInfo.host, targetInfo.port);
      } else {
        console.log(`[BYE] Failed to extract target info for call ${callId}`);
      }
      
      // Clean up call info
      this.callManager.removeCall(callId);
      console.log(`[BYE] Call ${callId} cleaned up`);
    } else {
      console.log(`[BYE] Call not found for Call-ID: ${callId}`);
    }
  }

  sendSIPMessage(message, host, port) {
    const buffer = Buffer.from(message);
    this.sipSocket.send(buffer, port, host);
    console.log(`Sent to ${host}:${port}:`);
    console.log(message.substring(0, 200) + '...');
  }

  makeCall(from, to) {
    console.log(`Making test call from ${from} to ${to}...`);
    
    if (!this.registrationManager.isRegistered(from)) {
      console.log(`Extension ${from} is not registered`);
      return;
    }
    
    if (!this.registrationManager.isRegistered(to)) {
      console.log(`Extension ${to} is not registered`);
      return;
    }
    
    const fromContact = this.registrationManager.getContact(from);
    const fromInfo = SIPMessageParser.extractContact(fromContact);
    
    if (!fromInfo) {
      console.log(`Could not get contact info for ${from}`);
      return;
    }
    
    // Create a test INVITE message
    const callId = `${Math.random().toString(36).substring(2, 15)}@127.0.0.1`;
    const branch = `z9hG4bK${Math.random().toString(36).substring(2, 15)}`;
    const tag = Math.random().toString(36).substring(2, 8);
    
    const inviteMessage = `INVITE sip:${to}@127.0.0.1 SIP/2.0\r
Via: SIP/2.0/UDP 127.0.0.1:${fromInfo.port};branch=${branch}\r
From: <sip:${from}@127.0.0.1>;tag=${tag}\r
To: <sip:${to}@127.0.0.1>\r
Call-ID: ${callId}\r
CSeq: 1 INVITE\r
Contact: <sip:${from}@127.0.0.1:${fromInfo.port}>\r
Content-Type: application/sdp\r
Content-Length: 0\r
\r
`;

    console.log(`Sending test INVITE from ${from} to ${to}`);
    this.sendSIPMessage(inviteMessage, fromInfo.host, fromInfo.port);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.sipSocket) {
      this.sipSocket.close();
    }
    
    if (this.rtpSocket) {
      this.rtpSocket.close();
    }
    
    this.rtpProxyManager.cleanup();
    console.log('SIP Server stopped');
  }
}

export default SIPServer; 