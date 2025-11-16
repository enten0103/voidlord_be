#!/bin/bash
# Manual deployment script for voidlord-be
# Run this script on the production server after CI has prepared the files
# Usage: ./deploy-app.sh

set -e

WORK_DIR="/opt/voidlord"
COMPOSE_FILE="docker-compose.prod.yml"

# GHCR credentials placeholders. CI will replace these with real values.
GHCR_USERNAME="__GHCR_USERNAME_PLACEHOLDER__"
GHCR_PASSWORD="__GHCR_PASSWORD_PLACEHOLDER__"

echo "========================================="
echo "VoidLord BE Manual Deployment Script"
echo "========================================="

echo ""
echo "GHCR login configuration used in CI (for reference):"
echo "  registry: ghcr.io"
echo "  username: \${{ github.actor }}"
echo "  password: \${{ secrets.GITHUB_TOKEN }}"
echo ""

# Check if running in the correct directory
if [ ! -f "$WORK_DIR/$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found in $WORK_DIR"
  echo "Please ensure the CI/CD workflow has completed successfully"
  exit 1
fi

cd "$WORK_DIR"

# GHCR login with hard-coded credentials
echo ""
echo "Step 0: Logging into GHCR (hard-coded)..."
MASKED_PASS="${GHCR_PASSWORD:0:4}********"  # show only first 4 chars
echo "Using GHCR username: $GHCR_USERNAME"
echo "Using GHCR password prefix: $MASKED_PASS"
echo "Running: docker login ghcr.io -u $GHCR_USERNAME --password-stdin"
echo "$GHCR_PASSWORD" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

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
