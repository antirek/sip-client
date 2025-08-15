// Test contact parsing functionality
import SIPMessageParser from './src/sip-server.js';

// Mock the SIPMessageParser class to test extractContact method
class TestSIPMessageParser {
  static extractContact(contactHeader) {
    const match = contactHeader.match(/sip:\d+@([^:]+):(\d+)/);
    return match ? { host: match[1], port: parseInt(match[2]) } : null;
  }
}

function testContactParsing() {
  console.log('=== Test Contact Parsing ===');
  
  const testCases = [
    '<sip:100@192.168.0.131:57669>',
    '<sip:101@192.168.0.131:5065>',
    '<sip:100@127.0.0.1:52571>',
    '<sip:101@127.0.0.1:40044>',
    'sip:100@192.168.0.131:57669',
    'sip:101@192.168.0.131:5065'
  ];
  
  for (const testCase of testCases) {
    const result = TestSIPMessageParser.extractContact(testCase);
    console.log(`Input: "${testCase}"`);
    console.log(`Result:`, result);
    console.log('---');
  }
  
  // Test with actual registration data
  console.log('=== Testing with actual registration data ===');
  const registrations = [
    '<sip:100@192.168.0.131:57669>',
    '<sip:101@192.168.0.131:5065>'
  ];
  
  for (const registration of registrations) {
    const info = TestSIPMessageParser.extractContact(registration);
    if (info) {
      console.log(`✓ Registration ${registration} -> ${info.host}:${info.port}`);
    } else {
      console.log(`✗ Failed to parse ${registration}`);
    }
  }
}

testContactParsing(); 