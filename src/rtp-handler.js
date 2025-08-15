import dgram from 'dgram';
import { EventEmitter } from 'events';

class RTPHandler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      localPort: config.localPort || 0, // 0 = dynamic port
      remoteHost: config.remoteHost || '127.0.0.1',
      remotePort: config.remotePort || 10000,
      ...config
    };
    
    this.socket = null;
    this.isActive = false;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
    this.actualLocalPort = null; // Store actual bound port
  }

  start() {
    console.log(`Starting RTP handler on dynamic port...`);
    
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      this.handleRTPPacket(msg, rinfo);
    });
    
    this.socket.on('error', (err) => {
      console.error('RTP Socket error:', err);
      this.emit('error', err);
    });
    
    // Bind to dynamic port
    this.socket.bind(this.config.localPort, () => {
      const address = this.socket.address();
      this.actualLocalPort = address.port;
      this.config.localPort = this.actualLocalPort; // Update config with actual port
      console.log(`RTP handler started on port ${this.actualLocalPort}`);
      this.isActive = true;
      this.emit('started');
    });
  }

  handleRTPPacket(packet, rinfo) {
    if (packet.length < 12) {
      console.warn('Received invalid RTP packet (too short)');
      return;
    }

    const rtpHeader = this.parseRTPHeader(packet);
    
    if (rtpHeader) {
      console.log(`Received RTP packet: seq=${rtpHeader.sequenceNumber}, ts=${rtpHeader.timestamp}, payload=${rtpHeader.payloadType}`);
      this.emit('rtp-packet', rtpHeader, packet.slice(12));
    }
  }

  parseRTPHeader(packet) {
    try {
      const version = (packet[0] >> 6) & 0x03;
      const padding = (packet[0] >> 5) & 0x01;
      const extension = (packet[0] >> 4) & 0x01;
      const csrcCount = packet[0] & 0x0F;
      const marker = (packet[1] >> 7) & 0x01;
      const payloadType = packet[1] & 0x7F;
      
      const sequenceNumber = packet.readUInt16BE(2);
      const timestamp = packet.readUInt32BE(4);
      const ssrc = packet.readUInt32BE(8);
      
      return {
        version,
        padding,
        extension,
        csrcCount,
        marker,
        payloadType,
        sequenceNumber,
        timestamp,
        ssrc
      };
    } catch (error) {
      console.error('Error parsing RTP header:', error);
      return null;
    }
  }

  sendRTPPacket(payload, payloadType = 0) {
    if (!this.isActive || !this.socket) {
      console.warn('RTP handler not active');
      return;
    }

    const header = this.createRTPHeader(payloadType);
    const packet = Buffer.concat([header, payload]);
    
    console.log(`Sending RTP packet: ${payload.length} bytes to ${this.config.remoteHost}:${this.config.remotePort}, seq=${this.sequenceNumber}, ts=${this.timestamp}`);
    
    this.socket.send(packet, this.config.remotePort, this.config.remoteHost);
    
    // Update sequence number and timestamp for next packet
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    this.timestamp += 160; // 20ms at 8kHz
  }

  createRTPHeader(payloadType = 0) {
    const header = Buffer.alloc(12);
    
    // Version 2, no padding, no extension, no CSRC
    header[0] = 0x80;
    
    // No marker, payload type
    header[1] = payloadType & 0x7F;
    
    // Sequence number
    header.writeUInt16BE(this.sequenceNumber, 2);
    
    // Timestamp
    header.writeUInt32BE(this.timestamp, 4);
    
    // SSRC
    header.writeUInt32BE(this.ssrc, 8);
    
    return header;
  }

  sendSilence(durationMs = 20) {
    // Generate silence (zeros) for the specified duration
    const samples = Math.floor(durationMs * 8); // 8kHz sample rate
    const silence = Buffer.alloc(samples);
    
    this.sendRTPPacket(silence, 0); // PCMU payload type
  }

  sendDTMF(digit, durationMs = 100) {
    // Send DTMF tone using RFC 2833
    const event = this.digitToEvent(digit);
    if (event !== null) {
      const dtmfPacket = this.createDTMFPacket(event, durationMs);
      this.sendRTPPacket(dtmfPacket, 101); // telephone-event payload type
    }
  }

  digitToEvent(digit) {
    const digitMap = {
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '*': 10, '#': 11, 'A': 12, 'B': 13, 'C': 14, 'D': 15
    };
    return digitMap[digit] !== undefined ? digitMap[digit] : null;
  }

  createDTMFPacket(event, durationMs) {
    const packet = Buffer.alloc(4);
    
    // Event
    packet[0] = event;
    
    // End of event flag (0 = start, 1 = end)
    packet[1] = 0x00;
    
    // Volume (0-36 dBm0, 0 = -36 dBm0)
    packet[2] = 0x00;
    
    // Duration (in timestamp units)
    const duration = Math.floor(durationMs * 8); // 8kHz sample rate
    packet.writeUInt16BE(duration, 2);
    
    return packet;
  }

  stop() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isActive = false;
    console.log('RTP handler stopped');
  }
}

export default RTPHandler; 