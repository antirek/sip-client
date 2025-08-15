import { EventEmitter } from 'events';
import dgram from 'dgram';
import net from 'net';
import crypto from 'crypto';
import RTPHandler from './rtp-handler.js';
import config from '../config.js';

class SIPClient extends EventEmitter {
  constructor(customConfig = {}) {
    super();
    
    // Merge default config with custom config
    this.config = {
      ...config.sip,
      ...customConfig
    };
    
    this.audioConfig = config.audio;
    this.loggingConfig = config.logging;
    
    this.socket = null;
    this.rtpHandler = null;
    this.callId = null;
    this.cseq = 1;
    this.isRegistered = false;
    this.isInCall = false;
    this.currentCallId = null;
    this.currentCallFrom = null;
    this.currentCallTo = null;
    this.rtpRemotePort = null;
    this.rtpRemoteHost = null;
    this.actualLocalPort = null; // Store actual bound port
    
    // Authentication state
    this.authRealm = '';
    this.authNonce = '';
    this.authQop = '';
    this.authOpaque = '';
    this.authAlgorithm = 'MD5';
    this.authAttempts = 0; // Track authentication attempts
  }

  log(level, message, data = null) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = levels[this.loggingConfig.level] || 2;
    
    if (levels[level] <= currentLevel) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      
      if (data) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    }
  }

  async start() {
    this.log('info', 'Starting SIP Client...');
    this.log('info', `Remote server: ${this.config.remoteHost}:${this.config.remotePort}`);
    this.log('info', `Username: ${this.config.username}`);
    this.log('info', `Domain: ${this.config.domain}`);
    if (this.config.authRequired) {
      this.log('info', 'Authentication: enabled');
    }
    
    // Create UDP socket for SIP
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      this.handleSIPMessage(msg.toString(), rinfo);
    });
    
    this.socket.on('error', (err) => {
      this.log('error', 'SIP Socket error:', err);
      this.emit('error', err);
    });
    
    // Bind to dynamic port (0 = let OS choose)
    this.socket.bind(0, () => {
      const address = this.socket.address();
      this.actualLocalPort = address.port;
      this.log('info', `SIP Client bound to dynamic port: ${this.actualLocalPort}`);
      
      // Initialize RTP handler with dynamic port
      this.initializeRTPHandler();
    });
  }

  async initializeRTPHandler() {
    // Initialize RTP handler with dynamic port
    this.rtpHandler = new RTPHandler({
      localPort: 0, // Dynamic RTP port too
      remoteHost: this.config.remoteHost,
      remotePort: config.rtp.localPort,
      ...config.rtp
    });
    
    this.rtpHandler.on('rtp-packet', (header, payload) => {
      this.handleRTPPacket(header, payload);
    });
    
    await this.rtpHandler.start();
    
    this.log('info', 'SIP Client started successfully');
    this.emit('started');
    
    // Auto-register
    await this.register();
  }

  async register() {
    if (this.isRegistered) {
      this.log('info', 'Already registered');
      return;
    }
    
    this.callId = this.generateCallId();
    const registerMessage = this.createRegisterMessage();
    
    this.log('info', 'Sending REGISTER request...');
    if (this.loggingConfig.enableSIPLogs) {
      this.log('debug', 'REGISTER message:', registerMessage);
    }
    this.sendSIPMessage(registerMessage);
    
    // Set timeout for registration
    this.registrationTimeout = setTimeout(() => {
      if (!this.isRegistered) {
        this.log('warn', 'Registration timeout - no response received');
        this.emit('registration-timeout');
      }
    }, 10000); // 10 seconds timeout
  }

  handleSIPMessage(message, remoteInfo) {
    this.log('debug', `Received SIP message from ${remoteInfo.address}:${remoteInfo.port}`);
    this.log('debug', `Message: ${message.substring(0, 200)}...`);
    
    // Check for registration response
    if (message.includes('SIP/2.0 200 OK') && message.includes('REGISTER')) {
      this.log('info', 'Registration successful!');
      this.isRegistered = true;
      this.emit('registered');
      return;
    }
    
    // Check for authentication challenge
    if (message.includes('SIP/2.0 401 Unauthorized')) {
      this.log('info', 'Received 401 Unauthorized - authentication required');
      this.handleAuthChallenge(message);
      return;
    }
    
    // Check for other error responses
    if (message.includes('SIP/2.0 403 Forbidden')) {
      this.log('error', 'Authentication failed - 403 Forbidden');
      this.emit('auth-failed');
      return;
    }
    
    if (message.includes('SIP/2.0 404 Not Found')) {
      this.log('error', 'Extension not found - 404 Not Found');
      this.emit('auth-failed');
      return;
    }
    
    if (message.includes('SIP/2.0 500 Internal Server Error')) {
      this.log('error', 'Server error - 500 Internal Server Error');
      this.emit('auth-failed');
      return;
    }
    
    // Handle incoming calls
    if (message.includes('INVITE sip:')) {
      this.log('info', 'Incoming call received');
      this.handleIncomingCall(message, remoteInfo);
      return;
    }
    
    // Handle other SIP messages
    this.log('debug', 'Unhandled SIP message type');
  }

  handleAuthChallenge(message) {
    this.log('info', 'Authentication challenge received');
    
    // Prevent infinite auth loop
    if (this.authAttempts >= 3) {
      this.log('error', 'Too many authentication attempts, stopping');
      this.emit('auth-failed');
      return;
    }
    
    this.authAttempts = (this.authAttempts || 0) + 1;
    
    // Parse WWW-Authenticate header
    const lines = message.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('WWW-Authenticate:')) {
        this.parseWWWAuthenticate(line);
        break;
      }
    }
    
    // Send authenticated REGISTER
    const authRegisterMessage = this.createAuthenticatedRegisterMessage();
    this.log('info', `Sending authenticated REGISTER request (attempt ${this.authAttempts})...`);
    this.sendSIPMessage(authRegisterMessage);
  }

  parseWWWAuthenticate(header) {
    // Parse: WWW-Authenticate: Digest realm="asterisk", nonce="1234567890", qop="auth", algorithm=MD5
    const authLine = header.substring(17); // Remove "WWW-Authenticate: "
    
    // Extract realm
    const realmMatch = authLine.match(/realm="([^"]+)"/);
    if (realmMatch) this.authRealm = realmMatch[1];
    
    // Extract nonce
    const nonceMatch = authLine.match(/nonce="([^"]+)"/);
    if (nonceMatch) this.authNonce = nonceMatch[1];
    
    // Extract qop
    const qopMatch = authLine.match(/qop="([^"]+)"/);
    if (qopMatch) this.authQop = qopMatch[1];
    
    // Extract opaque
    const opaqueMatch = authLine.match(/opaque="([^"]+)"/);
    if (opaqueMatch) this.authOpaque = opaqueMatch[1];
    
    // Extract algorithm
    const algorithmMatch = authLine.match(/algorithm=([^,\s]+)/);
    if (algorithmMatch) this.authAlgorithm = algorithmMatch[1];
    
    this.log('debug', `Auth parsed - Realm: ${this.authRealm}, Nonce: ${this.authNonce}`);
  }

  createAuthenticatedRegisterMessage() {
    const uri = `sip:${this.config.domain}`;
    const username = this.config.username;
    const password = this.config.password;
    const realm = this.authRealm;
    const nonce = this.authNonce;
    const qop = this.authQop;
    const opaque = this.authOpaque;
    const algorithm = this.authAlgorithm;
    
    // Generate cnonce
    const cnonce = this.generateNonce();
    
    // Generate nc (nonce count)
    const nc = '00000001';
    
    // Generate Authorization header
    const authHeader = this.generateAuthorizationHeader(
      'REGISTER', uri, username, password, realm, nonce, 
      qop, nc, cnonce, opaque, algorithm
    );
    
    return `REGISTER ${uri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.localHost}:${this.actualLocalPort};branch=${this.generateBranch()}\r
From: <sip:${username}@${this.config.domain}>;tag=${this.generateTag()}\r
To: <sip:${username}@${this.config.domain}>\r
Call-ID: ${this.callId}\r
CSeq: ${this.cseq++} REGISTER\r
Contact: <sip:${username}@${this.config.localHost}:${this.actualLocalPort}>\r
Expires: 3600\r
${authHeader}
Content-Length: 0\r
\r
`;
  }

  generateAuthorizationHeader(method, uri, username, password, realm, nonce, qop, nc, cnonce, opaque, algorithm) {
    // Calculate HA1 = MD5(username:realm:password)
    const ha1 = crypto.createHash('md5')
      .update(`${username}:${realm}:${password}`)
      .digest('hex');
    
    // Calculate HA2 = MD5(method:uri)
    const ha2 = crypto.createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');
    
    // Calculate response
    let response;
    if (qop) {
      // With qop: MD5(HA1:nonce:nc:cnonce:qop:HA2)
      response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        .digest('hex');
    } else {
      // Without qop: MD5(HA1:nonce:HA2)
      response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${ha2}`)
        .digest('hex');
    }
    
    // Build Authorization header
    let authHeader = `Authorization: Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", algorithm=${algorithm}, response="${response}"`;
    
    if (qop) {
      authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    }
    
    if (opaque) {
      authHeader += `, opaque="${opaque}"`;
    }
    
    return authHeader;
  }

  generateNonce() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  handleIncomingCall(message, rinfo) {
    this.log('info', 'Incoming call detected');
    
    // Parse INVITE message
    const lines = message.split('\r\n');
    let from = '';
    let to = '';
    let callId = '';
    let sdp = '';
    let inSdp = false;
    
    for (const line of lines) {
      if (line.startsWith('From:')) {
        from = line.substring(5).trim();
      } else if (line.startsWith('To:')) {
        to = line.substring(3).trim();
      } else if (line.startsWith('Call-ID:')) {
        callId = line.substring(8).trim();
      } else if (line.trim() === '') {
        inSdp = true;
      } else if (inSdp) {
        sdp += line + '\r\n';
      }
    }
    
    this.currentCallId = callId;
    this.currentCallFrom = from;
    this.currentCallTo = to;
    
    // Parse SDP to get RTP port
    this.parseSDP(sdp);
    
    this.log('info', `Incoming call from: ${from}`);
    this.log('info', `RTP remote: ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
    
    // Auto-answer the call
    this.answerCall();
  }

  parseSDP(sdp) {
    this.log('debug', `Parsing SDP: ${sdp}`);
    
    const lines = sdp.split('\r\n');
    for (const line of lines) {
      this.log('debug', `SDP line: ${line}`);
      
      if (line.startsWith('c=IN IP4')) {
        const parts = line.split(' ');
        this.rtpRemoteHost = parts[2];
        this.log('debug', `Found RTP remote host: ${this.rtpRemoteHost}`);
      } else if (line.startsWith('m=audio')) {
        const parts = line.split(' ');
        this.rtpRemotePort = parseInt(parts[1]);
        this.log('debug', `Found RTP remote port: ${this.rtpRemotePort}`);
      }
    }
    
    this.log('info', `RTP remote endpoint: ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
  }

  answerCall() {
    this.log('info', 'Auto-answering incoming call...');
    
    const response = this.create200OK();
    this.sendSIPMessage(response);
    
    this.isInCall = true;
    this.emit('call-answered');
    
    // Start audio exchange
    this.startAudioExchange();
  }

  startAudioExchange() {
    this.log('info', 'Starting audio exchange...');
    
    // Update RTP handler with remote endpoint
    if (this.rtpRemoteHost && this.rtpRemotePort) {
      this.rtpHandler.config.remoteHost = this.rtpRemoteHost;
      this.rtpHandler.config.remotePort = this.rtpRemotePort;
      this.log('info', `RTP handler configured: ${this.rtpRemoteHost}:${this.rtpRemotePort}`);
    } else {
      this.log('error', 'RTP remote endpoint not found in SDP!');
      return;
    }
    
    // Start sending audio samples
    this.audioInterval = setInterval(() => {
      this.sendAudioSample();
    }, 20); // 20ms intervals for 8kHz audio
    
    this.log('info', 'Audio exchange started - sending samples every 20ms');
  }

  stopAudioExchange() {
    this.log('info', 'Stopping audio exchange...');
    
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
  }

  sendAudioSample() {
    // Generate a simple audio sample (sine wave)
    const sample = this.generateAudioSample();
    this.rtpHandler.sendRTPPacket(sample, config.rtp.payloadType);
  }

  generateAudioSample() {
    // Generate 160 samples (20ms at 8kHz) of a simple tone
    const samples = Buffer.alloc(160);
    const frequency = this.audioConfig.frequency;
    const amplitude = this.audioConfig.amplitude;
    
    for (let i = 0; i < 160; i++) {
      const time = i / this.audioConfig.sampleRate; // Time in seconds
      const value = Math.sin(2 * Math.PI * frequency * time) * amplitude;
      // Convert to 8-bit PCM (0-255)
      const pcmValue = Math.floor((value + 1) * 127.5);
      samples[i] = pcmValue;
    }
    
    return samples;
  }

  handleRTPPacket(header, payload) {
    // Process incoming RTP audio
    if (this.loggingConfig.enableRTPLogs) {
      this.log('debug', `Received audio: ${payload.length} bytes, seq=${header.sequenceNumber}`);
    }
    
    // Here you could process the audio payload
    // For now, just acknowledge receipt
    this.emit('audio-received', payload);
  }

  createRegisterMessage() {
    return `REGISTER sip:${this.config.domain} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.localHost}:${this.actualLocalPort};branch=${this.generateBranch()}\r
From: <sip:${this.config.username}@${this.config.domain}>;tag=${this.generateTag()}\r
To: <sip:${this.config.username}@${this.config.domain}>\r
Call-ID: ${this.callId}\r
CSeq: ${this.cseq++} REGISTER\r
Contact: <sip:${this.config.username}@${this.config.localHost}:${this.actualLocalPort}>\r
Expires: 3600\r
Content-Length: 0\r
\r
`;
  }

  create200OK() {
    return `SIP/2.0 200 OK\r
Via: SIP/2.0/UDP ${this.config.localHost}:${this.actualLocalPort};branch=${this.generateBranch()}\r
From: ${this.currentCallFrom}\r
To: ${this.currentCallTo};tag=${this.generateTag()}\r
Call-ID: ${this.currentCallId}\r
CSeq: ${this.cseq++} INVITE\r
Contact: <sip:${this.config.username}@${this.config.localHost}:${this.actualLocalPort}>\r
Content-Type: application/sdp\r
Content-Length: ${this.createSDP().length}\r
\r
${this.createSDP()}`;
  }

  createSDP() {
    const rtpPort = this.rtpHandler ? this.rtpHandler.config.localPort : 0;
    return `v=0\r
o=${this.config.username} 1234567890 1234567890 IN IP4 ${this.config.localHost}\r
s=SIP Call\r
c=IN IP4 ${this.config.localHost}\r
t=0 0\r
m=audio ${rtpPort} RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-16\r
`;
  }

  sendAck() {
    const ackMessage = `ACK sip:${this.config.username}@${this.config.domain} SIP/2.0\r
Via: SIP/2.0/UDP ${this.config.localHost}:${this.actualLocalPort};branch=${this.generateBranch()}\r
From: <sip:${this.config.username}@${this.config.domain}>;tag=${this.generateTag()}\r
To: <sip:${this.config.username}@${this.config.domain}>\r
Call-ID: ${this.callId}\r
CSeq: ${this.cseq++} ACK\r
Content-Length: 0\r
\r
`;
    this.sendSIPMessage(ackMessage);
  }

  sendSIPMessage(message) {
    const buffer = Buffer.from(message);
    this.socket.send(buffer, this.config.remotePort, this.config.remoteHost);
  }

  generateCallId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  generateBranch() {
    return 'z9hG4bK' + Math.random().toString(36).substring(2, 15);
  }

  generateTag() {
    return Math.random().toString(36).substring(2, 10);
  }

  stop() {
    if (this.socket) {
      this.socket.close();
    }
    if (this.rtpHandler) {
      this.rtpHandler.stop();
    }
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
    }
    this.log('info', 'SIP Client stopped');
  }
}

// Auto-start the client
async function main() {
  console.log('SIP Client Console Application');
  console.log('==============================');
  
  // Display current configuration
  console.log('Current configuration:');
  console.log(`  SIP Remote: ${config.sip.remoteHost}:${config.sip.remotePort}`);
  console.log(`  SIP Username: ${config.sip.username}`);
  console.log(`  SIP Domain: ${config.sip.domain}`);
  console.log(`  SIP Auth Required: ${config.sip.authRequired}`);
  console.log(`  Audio Frequency: ${config.audio.frequency} Hz`);
  console.log(`  Log Level: ${config.logging.level}`);
  console.log('');
  
  const client = new SIPClient();

  client.on('started', () => {
    console.log('✓ Client started and ready for incoming calls');
  });

  client.on('registered', () => {
    console.log('✓ Registration successful - waiting for calls...');
  });

  client.on('call-answered', () => {
    console.log('✓ Call answered - audio exchange started');
  });

  client.on('call-ended', () => {
    console.log('✓ Call ended');
  });

  client.on('audio-received', (payload) => {
    // Handle received audio
    if (config.logging.enableAudioLogs) {
      console.log(`Received ${payload.length} bytes of audio`);
    }
  });

  await client.start();

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    client.stop();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default SIPClient; 