#!/bin/bash

# Fix script for node-hid native bindings on Linux systems
# This script addresses the "Could not locate the bindings file" error

echo "🔧 Fixing node-hid native bindings for Linux..."

# Check if we're on a Linux system
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script is designed for Linux systems only."
    exit 1
fi

# Detect package manager and install dependencies
if command -v apt-get &> /dev/null; then
    echo "📦 Detected apt package manager (Ubuntu/Debian/Mint)"
    echo "Installing build dependencies..."
    sudo apt-get update
    sudo apt-get install -y build-essential libudev-dev
elif command -v yum &> /dev/null; then
    echo "📦 Detected yum package manager (CentOS/RHEL)"
    echo "Installing build dependencies..."
    sudo yum groupinstall -y "Development Tools"
    sudo yum install -y libudev-devel
elif command -v dnf &> /dev/null; then
    echo "📦 Detected dnf package manager (Fedora)"
    echo "Installing build dependencies..."
    sudo dnf groupinstall -y "Development Tools"
    sudo dnf install -y libudev-devel
else
    echo "⚠️  Could not detect package manager. Please install build-essential and libudev-dev manually."
fi

# Check if pnpm is available
if command -v pnpm &> /dev/null; then
    echo "📦 Using pnpm to rebuild native modules..."
    pnpm rebuild-native
    if [ $? -ne 0 ]; then
        echo "⚠️  Rebuild failed, trying force install..."
        pnpm install --force
    fi
elif command -v npm &> /dev/null; then
    echo "📦 Using npm to rebuild native modules..."
    npm rebuild node-hid
    if [ $? -ne 0 ]; then
        echo "⚠️  Rebuild failed, trying force install..."
        npm install --force
    fi
else
    echo "❌ Neither pnpm nor npm found. Please install Node.js and a package manager."
    exit 1
fi

# Verify the fix
echo "🔍 Verifying the fix..."
if command -v node &> /dev/null; then
    node -e "
    try {
        require('node-hid');
        console.log('✅ node-hid bindings are working correctly!');
    } catch (error) {
        console.log('❌ node-hid bindings still not working:');
        console.log(error.message);
        process.exit(1);
    }
    "
else
    echo "⚠️  Node.js not found, cannot verify the fix."
fi

echo "🎉 Fix script completed!"
echo ""
echo "If you're still experiencing issues, try:"
echo "1. Restart your terminal"
echo "2. Clear node_modules and reinstall: rm -rf node_modules && pnpm install"
echo "3. Check that your Ledger device is connected and unlocked"
