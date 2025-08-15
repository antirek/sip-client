import SIPServer from './sip-server.js';

console.log('SIP Server (External Access)');
console.log('============================');

const server = new SIPServer({
  port: 5060,
  host: '0.0.0.0'  // Listen on all interfaces
});

server.on('started', () => {
  console.log('✓ SIP Server is ready for external registrations and calls');
  console.log('');
  console.log('External clients can connect using:');
  console.log('  SIP Server: YOUR_EXTERNAL_IP:5060');
  console.log('  Username: any number (e.g., 100, 101, 102, etc.)');
  console.log('  Password: (not required)');
  console.log('  Domain: YOUR_EXTERNAL_IP');
  console.log('');
  console.log('Available commands:');
  console.log('  make-call <from> <to>  - Make a test call');
  console.log('  list-registrations     - Show registered extensions');
  console.log('  quit                   - Stop server');
  console.log('');
  
  // Set up interactive commands
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data) => {
    const command = data.trim();
    
    if (command.startsWith('make-call ')) {
      const parts = command.split(' ');
      if (parts.length === 3) {
        const from = parts[1];
        const to = parts[2];
        server.makeCall(from, to);
      } else {
        console.log('Usage: make-call <from> <to>');
      }
    } else if (command === 'list-registrations') {
      console.log('Registered extensions:');
      for (const [username, info] of server.registrations) {
        console.log(`  ${username} -> ${info.contact}`);
      }
    } else if (command === 'quit') {
      console.log('Stopping server...');
      server.stop();
      process.exit(0);
    } else if (command) {
      console.log('Unknown command. Available: make-call, list-registrations, quit');
    }
  });
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping server...');
  server.stop();
  process.exit(0);
});

server.start();
