import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  // SIP Configuration
  sip: {
    localPort: parseInt(process.env.SIP_LOCAL_PORT) || 5060,
    remoteHost: process.env.SIP_REMOTE_HOST || '127.0.0.1',
    remotePort: parseInt(process.env.SIP_REMOTE_PORT) || 5060,
    username: process.env.SIP_USERNAME || 'sip_client',
    password: process.env.SIP_PASSWORD || '',
    domain: process.env.SIP_DOMAIN || 'localhost',
    localHost: process.env.SIP_LOCAL_HOST || '127.0.0.1',
    authRequired: process.env.SIP_AUTH_REQUIRED === 'true' || false
  },
  
  // RTP Configuration
  rtp: {
    localPort: parseInt(process.env.RTP_LOCAL_PORT) || 10000,
    remoteHost: process.env.RTP_REMOTE_HOST || '127.0.0.1',
    remotePort: parseInt(process.env.RTP_REMOTE_PORT) || 10000,
    sampleRate: parseInt(process.env.RTP_SAMPLE_RATE) || 8000,
    payloadType: parseInt(process.env.RTP_PAYLOAD_TYPE) || 0 // PCMU
  },
  
  // Audio Configuration
  audio: {
    codec: process.env.AUDIO_CODEC || 'PCMU',
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE) || 8000,
    channels: parseInt(process.env.AUDIO_CHANNELS) || 1,
    bitDepth: parseInt(process.env.AUDIO_BIT_DEPTH) || 16,
    frequency: parseInt(process.env.AUDIO_FREQUENCY) || 440, // Hz
    amplitude: parseFloat(process.env.AUDIO_AMPLITUDE) || 0.3
  },
  
  // Call Configuration
  call: {
    timeout: parseInt(process.env.CALL_TIMEOUT) || 30000, // 30 seconds
    retryCount: parseInt(process.env.CALL_RETRY_COUNT) || 3,
    keepAlive: process.env.CALL_KEEP_ALIVE === 'true' || true
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableSIPLogs: process.env.LOG_SIP === 'true' || true,
    enableRTPLogs: process.env.LOG_RTP === 'true' || true,
    enableAudioLogs: process.env.LOG_AUDIO === 'true' || false
  }
};

// Helper function to get all environment variables
export function getEnvVars() {
  return {
    SIP_LOCAL_PORT: process.env.SIP_LOCAL_PORT || '5060',
    SIP_REMOTE_HOST: process.env.SIP_REMOTE_HOST || '127.0.0.1',
    SIP_REMOTE_PORT: process.env.SIP_REMOTE_PORT || '5060',
    SIP_USERNAME: process.env.SIP_USERNAME || 'sip_client',
    SIP_PASSWORD: process.env.SIP_PASSWORD || '',
    SIP_DOMAIN: process.env.SIP_DOMAIN || 'localhost',
    SIP_LOCAL_HOST: process.env.SIP_LOCAL_HOST || '127.0.0.1',
    SIP_AUTH_REQUIRED: process.env.SIP_AUTH_REQUIRED || 'false',
    RTP_LOCAL_PORT: process.env.RTP_LOCAL_PORT || '10000',
    RTP_REMOTE_HOST: process.env.RTP_REMOTE_HOST || '127.0.0.1',
    RTP_REMOTE_PORT: process.env.RTP_REMOTE_PORT || '10000',
    RTP_SAMPLE_RATE: process.env.RTP_SAMPLE_RATE || '8000',
    RTP_PAYLOAD_TYPE: process.env.RTP_PAYLOAD_TYPE || '0',
    AUDIO_CODEC: process.env.AUDIO_CODEC || 'PCMU',
    AUDIO_SAMPLE_RATE: process.env.AUDIO_SAMPLE_RATE || '8000',
    AUDIO_CHANNELS: process.env.AUDIO_CHANNELS || '1',
    AUDIO_BIT_DEPTH: process.env.AUDIO_BIT_DEPTH || '16',
    AUDIO_FREQUENCY: process.env.AUDIO_FREQUENCY || '440',
    AUDIO_AMPLITUDE: process.env.AUDIO_AMPLITUDE || '0.3',
    CALL_TIMEOUT: process.env.CALL_TIMEOUT || '30000',
    CALL_RETRY_COUNT: process.env.CALL_RETRY_COUNT || '3',
    CALL_KEEP_ALIVE: process.env.CALL_KEEP_ALIVE || 'true',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_SIP: process.env.LOG_SIP || 'true',
    LOG_RTP: process.env.LOG_RTP || 'true',
    LOG_AUDIO: process.env.LOG_AUDIO || 'false'
  };
}

export default config; 