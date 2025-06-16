#!/bin/bash

# Create deployment package for SSL Certificate Manager
echo "Creating deployment package..."

# Create temporary directory
TEMP_DIR="ssl-manager-deployment"
rm -rf $TEMP_DIR
mkdir $TEMP_DIR

# Copy essential files
cp server.js $TEMP_DIR/
cp package.json $TEMP_DIR/
cp -r routes/ $TEMP_DIR/
cp -r services/ $TEMP_DIR/
cp -r public/ $TEMP_DIR/
cp deploy.md $TEMP_DIR/
cp deploy.sh $TEMP_DIR/

# Create archive
tar -czf ssl-manager-deployment.tar.gz $TEMP_DIR/

# Clean up
rm -rf $TEMP_DIR

echo "Deployment package created: ssl-manager-deployment.tar.gz"
echo ""
echo "To deploy to your server:"
echo "1. Upload ssl-manager-deployment.tar.gz to your server"
echo "2. Extract: tar -xzf ssl-manager-deployment.tar.gz"
echo "3. Run: cd ssl-manager-deployment && sudo ./deploy.sh"