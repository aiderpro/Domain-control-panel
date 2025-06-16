# GitHub Integration Guide

## Option 1: Connect Replit to GitHub (Recommended)

### Step 1: Connect Replit to GitHub
1. In your Replit, click the "Version Control" tab (git icon) in the left sidebar
2. Click "Create a Git Repo" 
3. Choose "Connect to GitHub"
4. Authorize Replit to access your GitHub account
5. Create a new repository or connect to existing one

### Step 2: Repository Setup
```bash
# Repository name suggestion: ssl-certificate-manager
# Description: Web-based SSL certificate management tool for nginx servers
# Make it Public or Private (your choice)
```

### Step 3: Push to GitHub
1. Replit will automatically push your code to GitHub
2. All files will be available in your new repository

## Option 2: Manual GitHub Setup

### Step 1: Create Repository on GitHub
1. Go to GitHub.com
2. Click "New repository"
3. Name: `ssl-certificate-manager`
4. Description: `Web-based SSL certificate management tool for nginx servers`
5. Choose Public/Private
6. Don't initialize with README (we already have one)

### Step 2: Get Repository URL
After creating, you'll get a URL like:
```
https://github.com/YOUR_USERNAME/ssl-certificate-manager.git
```

## Deployment to Your Server

### Method 1: Direct Git Clone (Easiest)
```bash
# On your server
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/ssl-certificate-manager.git nginx-control-panel
cd nginx-control-panel
sudo ./deploy.sh
```

### Method 2: Using SSH Keys (More Secure)
```bash
# Generate SSH key on your server
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add public key to GitHub
cat ~/.ssh/id_ed25519.pub
# Copy this to GitHub Settings > SSH Keys

# Clone with SSH
git clone git@github.com:YOUR_USERNAME/ssl-certificate-manager.git
```

### Method 3: Download ZIP
```bash
# Download and extract
wget https://github.com/YOUR_USERNAME/ssl-certificate-manager/archive/main.zip
unzip main.zip
cd ssl-certificate-manager-main
sudo ./deploy.sh
```

## Updating Your Server

After making changes, update your server:
```bash
cd /var/www/nginx-control-panel
sudo git pull origin main
sudo systemctl restart ssl-manager
```

## Automatic Updates (Optional)

Create a webhook for automatic deployment:
```bash
# Create update script
sudo tee /usr/local/bin/update-ssl-manager.sh << 'EOF'
#!/bin/bash
cd /var/www/nginx-control-panel
git pull origin main
npm install --production
systemctl restart ssl-manager
EOF

sudo chmod +x /usr/local/bin/update-ssl-manager.sh
```

## Repository Structure
```
ssl-certificate-manager/
├── server.js              # Main server file
├── package.json           # Dependencies
├── routes/                # API routes
├── services/              # Backend services
├── public/                # Frontend files
├── deploy.sh              # Deployment script
├── README.md              # Documentation
└── .gitignore            # Git ignore rules
```