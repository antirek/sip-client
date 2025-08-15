#!/bin/bash

echo "Starting SIP Server..."
echo "======================"

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

echo "Configuration:"
echo "  SIP Server Port: 5060"
echo "  Host: 0.0.0.0 (all interfaces)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start SIP server
echo "Starting SIP server..."
node src/server.js 