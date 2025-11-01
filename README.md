# MGNREGA District Performance Tracker - Deployment Guide

## 📋 Overview
Production-ready MGNREGA tracker with MySQL database backend and Node.js API server.

## 🏗️ Architecture

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Frontend HTML  │ (Served via Nginx)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Node.js API   │ (Port 3000)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MySQL Database │ (Port 3306)
└─────────────────┘
```

## 📦 Prerequisites

### On Your VPS/VM:
- Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- Root or sudo access
- At least 2GB RAM
- 20GB disk space

## 🚀 Step-by-Step Deployment

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server

# Install Nginx (for serving frontend)
sudo apt install -y nginx

# Install PM2 (for process management)
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

### Step 2: MySQL Database Setup

```bash
# Secure MySQL installation
sudo mysql_secure_installation

# Login to MySQL
sudo mysql -u root -p

# Run these commands in MySQL prompt:
```

```sql
-- Create database and user
CREATE DATABASE mgnrega_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mgnrega_user'@'localhost' IDENTIFIED BY 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON mgnrega_db.* TO 'mgnrega_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
# Import database schema
mysql -u mgnrega_user -p mgnrega_db < schema.sql
```

### Step 3: Application Deployment

```bash
# Create application directory
sudo mkdir -p /var/www/mgnrega
sudo chown -R $USER:$USER /var/www/mgnrega
cd /var/www/mgnrega

# Upload your files or clone repository
# Place these files in /var/www/mgnrega/:
# - server.js
# - package.json
# - .env
# - public/index.html (frontend)

# Install dependencies
npm install

# Create .env file
nano .env
```

Paste this in `.env`:
```env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=mgnrega_user
DB_PASSWORD=YourSecurePassword123!
DB_NAME=mgnrega_db
```

### Step 4: Frontend Setup

```bash
# Create public directory for frontend
mkdir -p /var/www/mgnrega/public

# Place index.html in public folder
# Your index.html should be at: /var/www/mgnrega/public/index.html
```

### Step 5: Start Application with PM2

```bash
# Start application
pm2 start server.js --name mgnrega-api

# Enable auto-start on system reboot
pm2 startup systemd
pm2 save

# Check status
pm2 status
pm2 logs mgnrega-api
```

### Step 6: Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/mgnrega
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-server-ip;  # Replace with your IP or domain

    # Root directory for frontend
    root /var/www/mgnrega/public;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/mgnrega /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Step 7: Firewall Configuration

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 8: Initial Data Population

```bash
# Trigger manual data sync to populate database
curl -X POST http://localhost:3000/api/sync-data

# Or access via browser:
# http://your-server-ip/api/sync-data
```

### Step 9: SSL Certificate (Optional but Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## 🔍 Testing

### Test Backend API:
```bash
# Health check
curl http://localhost:3000/api/health

# Get district data
curl "http://localhost:3000/api/district-data?state=MH&district=नागपुर%20(Nagpur)"
```

### Test Frontend:
Open browser and navigate to:
- `http://your-server-ip` (or your domain)

## 📊 Monitoring

### View Logs:
```bash
# Application logs
pm2 logs mgnrega-api

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MySQL logs
sudo tail -f /var/log/mysql/error.log
```

### Monitor Resources:
```bash
# PM2 monitoring
pm2 monit

# System resources
htop
```

## 🔧 Maintenance

### Update Application:
```bash
cd /var/www/mgnrega
git pull  # If using git
npm install  # If dependencies changed
pm2 restart mgnrega-api
```

### Database Backup:
```bash
# Manual backup
mysqldump -u mgnrega_user -p mgnrega_db > backup_$(date +%Y%m%d).sql

# Automated daily backup (cron)
sudo crontab -e
# Add this line:
0 3 * * * mysqldump -u mgnrega_user -pYourPassword mgnrega_db > /backup/mgnrega_$(date +\%Y\%m\%d).sql
```

### Restore Database:
```bash
mysql -u mgnrega_user -p mgnrega_db < backup_20251029.sql
```

## 🐛 Troubleshooting

### Application won't start:
```bash
# Check PM2 logs
pm2 logs mgnrega-api --lines 50

# Check Node.js is installed
node --version
npm --version
```

### Database connection fails:
```bash
# Test MySQL connection
mysql -u mgnrega_user -p

# Check MySQL is running
sudo systemctl status mysql

# Restart MySQL
sudo systemctl restart mysql
```

### Nginx errors:
```bash
# Check configuration
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### Port already in use:
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

## 📈 Performance Optimization

### 1. Database Indexing:
Already included in schema.sql with optimized indexes.

### 2. Nginx Caching:
```nginx
# Add to nginx config
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

location /api/district-data {
    proxy_cache api_cache;
    proxy_cache_valid 200 30m;
    proxy_pass http://localhost:3000/api/district-data;
}
```

### 3. Database Connection Pooling:
Already configured in server.js with connectionLimit: 10

### 4. PM2 Cluster Mode:
```bash
pm2 start server.js -i max --name mgnrega-api
```

## 🔐 Security Checklist

- [ ] Changed default MySQL password
- [ ] Configured firewall (UFW)
- [ ] Installed SSL certificate
- [ ] Disabled root SSH login
- [ ] Set up automatic security updates
- [ ] Configured rate limiting in Nginx
- [ ] Regular database backups
- [ ] Monitoring and logging enabled

## 📞 Support

For issues or questions:
1. Check logs: `pm2 logs mgnrega-api`
2. Review this deployment guide
3. Check MySQL connection and data

## 📝 File Structure

```
/var/www/mgnrega/
├── server.js              # Main API server
├── package.json           # Node dependencies
├── .env                   # Environment variables
├── schema.sql             # Database schema
├── public/
│   └── index.html         # Frontend application
├── node_modules/          # NPM packages
└── logs/                  # Application logs
```

## 🎯 Production Checklist

Before going live:
- [ ] Database is set up and populated
- [ ] Backend API is running (check health endpoint)
- [ ] Frontend loads correctly
- [ ] Auto-location detection works
- [ ] District selection works
- [ ] Data displays correctly
- [ ] SSL certificate installed (if domain available)
- [ ] PM2 configured for auto-restart
- [ ] Backups configured
- [ ] Monitoring set up

## 🚀 Quick Start Commands

```bash
# One-time setup
sudo apt update && sudo apt install -y nodejs mysql-server nginx
sudo npm install -g pm2
mysql -u root -p < schema.sql
npm install

# Start application
pm2 start server.js --name mgnrega-api
pm2 save

# Access application
# http://your-server-ip
```

Your MGNREGA tracker is now live! 🎉