#!/bin/bash

echo "=== SIP Two Clients Test Runner ==="
echo "==================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the project directory."
    exit 1
fi

echo "This test will:"
echo "1. Start two SIP clients (extensions 100 and 101)"
echo "2. Register both clients on the SIP server"
echo "3. Test calls between the clients"
echo "4. Test call to non-existent extension"
echo ""

# Check if SIP server is running
if ! pgrep -f "node.*server" > /dev/null; then
    echo "⚠️  Warning: SIP server doesn't seem to be running"
    echo "Please start the SIP server first with: ./start-server-external.sh"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Test cancelled"
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting test..."
echo ""

# Run the test
node test-two-clients.js 