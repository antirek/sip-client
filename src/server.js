import SIPServer from './sip-server.js';

console.log('SIP Server Console Application');
console.log('==============================');

const server = new SIPServer({
  port: 5060,
  host: '0.0.0.0'
});

server.on('started', () => {
  console.log('✓ SIP Server is ready for registrations and calls');
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