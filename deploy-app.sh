#!/bin/bash
# Manual deployment script for voidlord-be
# Run this script on the production server after CI has prepared the files
# Usage: ./deploy-app.sh

set -e

WORK_DIR="/opt/voidlord"
COMPOSE_FILE="docker-compose.prod.yml"

echo "========================================="
echo "VoidLord BE Manual Deployment Script"
echo "========================================="

# Check if running in the correct directory
if [ ! -f "$WORK_DIR/$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found in $WORK_DIR"
  echo "Please ensure the CI/CD workflow has completed successfully"
  exit 1
fi

cd "$WORK_DIR"

# Verify .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found"
  echo "Please ensure the CI/CD workflow has completed successfully"
  exit 1
fi

echo ""
echo "Step 1: Pulling Docker images..."
echo "This may take a while depending on your network speed"
docker compose -f "$COMPOSE_FILE" pull

echo ""
echo "Step 2: Stopping existing containers (if any)..."
docker compose -f "$COMPOSE_FILE" down || true

echo ""
echo "Step 3: Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "Step 4: Checking service status..."
sleep 3
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "========================================="
echo "Deployment completed successfully!"
echo "========================================="
echo ""
echo "You can check logs with:"
echo "  docker compose -f $COMPOSE_FILE logs -f"
echo ""
echo "Or check specific service logs:"
echo "  docker compose -f $COMPOSE_FILE logs -f app"
echo "  docker compose -f $COMPOSE_FILE logs -f postgres"
echo "  docker compose -f $COMPOSE_FILE logs -f minio"
