#!/bin/bash

# MGNREGA Tracker - Automated Deployment Script
# Usage: sudo bash deploy.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  MGNREGA District Tracker - Auto Deploy      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root (use sudo)${NC}" 
   exit 1
fi

# Get the actual user who ran sudo
ACTUAL_USER=${SUDO_USER:-$USER}

echo -e "${YELLOW}📋 Starting deployment process...${NC}"
echo ""

# Step 1: Install dependencies
echo -e "${GREEN}[1/10] Installing system dependencies...${NC}"
apt update -y > /dev/null 2>&1
apt install -y curl wget git nginx mysql-server > /dev/null 2>&1
echo -e "${GREEN}✓ System dependencies installed${NC}"
echo ""

# Step 2: Install Node.js
echo -e "${GREEN}[2/10] Installing Node.js 18.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
fi
node --version
npm --version
echo -e "${GREEN}✓ Node.js installed${NC}"
echo ""

# Step 3: Install PM2
echo -e "${GREEN}[3/10] Installing PM2...${NC}"
npm install -g pm2 > /dev/null 2>&1
echo -e "${GREEN}✓ PM2 installed${NC}"
echo ""

# Step 4: Create directory structure
echo -e "${GREEN}[4/10] Creating application directories...${NC}"
mkdir -p /var/www/mgnrega/public
mkdir -p /var/www/mgnrega/logs
mkdir -p /backup/mgnrega
chown -R $ACTUAL_USER:$ACTUAL_USER /var/www/mgnrega
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Step 5: Database setup
echo -e "${GREEN}[5/10] Setting up MySQL database...${NC}"
systemctl start mysql
systemctl enable mysql > /dev/null 2>&1

echo -e "${YELLOW}Enter MySQL root password (press Enter if none set):${NC}"
read -s MYSQL_ROOT_PASS

echo -e "${YELLOW}Enter new password for mgnrega_user:${NC}"
read -s DB_PASSWORD
echo ""

# Create database and user
mysql -u root -p"$MYSQL_ROOT_PASS" <<EOF > /dev/null 2>&1
CREATE DATABASE IF NOT EXISTS mgnrega_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mgnrega_user'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON mgnrega_db.* TO 'mgnrega_user'@'localhost';
FLUSH PRIVILEGES;
EOF

echo -e "${GREEN}✓ Database configured${NC}"
echo ""

# Step 6: Copy files
echo -e "${GREEN}[6/10] Copying application files...${NC}"
cd /var/www/mgnrega

# Check if files exist in current directory
if [ ! -f "server.js" ]; then
    echo -e "${YELLOW}⚠ server.js not found in current directory${NC}"
    echo -e "${YELLOW}Please place the following files in $(pwd):${NC}"
    echo -e "  - server.js"
    echo -e "  - package.json"
    echo -e "  - schema.sql"
    echo -e "  - public/index.html"
    echo ""
    echo -e "${RED}Deployment paused. After copying files, run:${NC}"
    echo -e "${YELLOW}cd /var/www/mgnrega && sudo bash deploy.sh --continue${NC}"
    exit 1
fi

# Import database schema
if [ -f "schema.sql" ]; then
    mysql -u mgnrega_user -p"$DB_PASSWORD" mgnrega_db < schema.sql > /dev/null 2>&1
    echo -e "${GREEN}✓ Database schema imported${NC}"
else
    echo -e "${YELLOW}⚠ schema.sql not found, skipping database import${NC}"
fi
echo ""

# Step 7: Create .env file
echo -e "${GREEN}[7/10] Creating configuration files...${NC}"
cat > .env <<EOF
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=mgnrega_user
DB_PASSWORD=$DB_PASSWORD
DB_NAME=mgnrega_db
API_RATE_LIMIT=100
LOG_LEVEL=info
CORS_ORIGIN=*
ENABLE_AUTO_SYNC=true
SYNC_SCHEDULE=0 2 * * *
EOF
chown $ACTUAL_USER:$ACTUAL_USER .env
chmod 600 .env
echo -e "${GREEN}✓ Configuration created${NC}"
echo ""

# Step 8: Install Node dependencies
echo -e "${GREEN}[8/10] Installing Node.js dependencies...${NC}"
su - $ACTUAL_USER -c "cd /var/www/mgnrega && npm install" > /dev/null 2>&1
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 9: Configure Nginx
echo -e "${GREEN}[9/10] Configuring Nginx...${NC}"

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

cat > /etc/nginx/sites-available/mgnrega <<EOF
server {
    listen 80;
    server_name $SERVER_IP _;

    root /var/www/mgnrega/public;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

ln -sf /etc/nginx/sites-available/mgnrega /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t > /dev/null 2>&1
systemctl restart nginx
systemctl enable nginx > /dev/null 2>&1

echo -e "${GREEN}✓ Nginx configured${NC}"
echo ""

# Step 10: Start application
echo -e "${GREEN}[10/10] Starting application...${NC}"

# Stop any existing instance
su - $ACTUAL_USER -c "pm2 delete mgnrega-api" > /dev/null 2>&1 || true

# Start new instance
su - $ACTUAL_USER -c "cd /var/www/mgnrega && pm2 start server.js --name mgnrega-api" > /dev/null 2>&1
su - $ACTUAL_USER -c "pm2 startup systemd -u $ACTUAL_USER --hp /home/$ACTUAL_USER" > /dev/null 2>&1
su - $ACTUAL_USER -c "pm2 save" > /dev/null 2>&1

echo -e "${GREEN}✓ Application started${NC}"
echo ""

# Configure firewall
echo -e "${GREEN}Configuring firewall...${NC}"
ufw --force enable > /dev/null 2>&1
ufw allow 22/tcp > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw allow 443/tcp > /dev/null 2>&1
echo -e "${GREEN}✓ Firewall configured${NC}"
echo ""

# Trigger initial data sync
echo -e "${GREEN}Populating initial data...${NC}"
sleep 5
curl -s -X POST http://localhost:3000/api/sync-data > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Initial data sync triggered${NC}"
echo ""

# Setup daily backup
echo -e "${GREEN}Setting up automated backups...${NC}"
cat > /usr/local/bin/mgnrega-backup.sh <<'EOFBACKUP'
#!/bin/bash
BACKUP_DIR="/backup/mgnrega"
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u mgnrega_user -p'__DB_PASSWORD__' mgnrega_db > $BACKUP_DIR/backup_$DATE.sql
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
EOFBACKUP

sed -i "s/__DB_PASSWORD__/$DB_PASSWORD/g" /usr/local/bin/mgnrega-backup.sh
chmod +x /usr/local/bin/mgnrega-backup.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/mgnrega-backup.sh") | crontab -

echo -e "${GREEN}✓ Automated backups configured${NC}"
echo ""

# Final status check
echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Deployment Complete! 🎉               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Application Details:${NC}"
echo -e "  Frontend URL:    ${YELLOW}http://$SERVER_IP${NC}"
echo -e "  API Health:      ${YELLOW}http://$SERVER_IP/api/health${NC}"
echo -e "  Database:        ${YELLOW}mgnrega_db${NC}"
echo -e "  Logs:            ${YELLOW}pm2 logs mgnrega-api${NC}"
echo ""

echo -e "${GREEN}Quick Commands:${NC}"
echo -e "  View logs:       ${YELLOW}pm2 logs mgnrega-api${NC}"
echo -e "  Restart app:     ${YELLOW}pm2 restart mgnrega-api${NC}"
echo -e "  Stop app:        ${YELLOW}pm2 stop mgnrega-api${NC}"
echo -e "  Check status:    ${YELLOW}pm2 status${NC}"
echo -e "  Manual backup:   ${YELLOW}/usr/local/bin/mgnrega-backup.sh${NC}"
echo ""

echo -e "${GREEN}Next Steps:${NC}"
echo -e "  1. Open ${YELLOW}http://$SERVER_IP${NC} in your browser"
echo -e "  2. Test the application"
echo -e "  3. (Optional) Set up SSL: ${YELLOW}sudo certbot --nginx${NC}"
echo ""

# Test health endpoint
echo -e "${YELLOW}Testing application health...${NC}"
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:3000/api/health | grep -o '"status":"healthy"' || echo "")

if [ -n "$HEALTH_CHECK" ]; then
    echo -e "${GREEN}✓ Application is healthy and running!${NC}"
else
    echo -e "${RED}⚠ Warning: Health check failed. Check logs with: pm2 logs mgnrega-api${NC}"
fi

echo ""
echo -e "${GREEN}Deployment script completed successfully!${NC}"
echo ""