#!/bin/bash
# Zebby's World API - cURL Test Examples
# Test both Firebase Bearer token auth and session-based auth flows

BASE_URL="${BASE_URL:-http://localhost:5000}"
FIREBASE_TOKEN="${FIREBASE_ID_TOKEN:-}"

echo "=================================================="
echo "Zebby's World API - cURL Test Suite"
echo "=================================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 1. Health & Uptime Checks (No Auth) ===${NC}"
echo ""

echo -e "${YELLOW}1a. Simple uptime ping:${NC}"
curl -s "$BASE_URL/api/ping" | jq '.'
echo ""

echo -e "${YELLOW}1b. API health check:${NC}"
curl -s "$BASE_URL/api/health" | jq '.'
echo ""

echo -e "${YELLOW}1c. RAG health check:${NC}"
curl -s "$BASE_URL/api/rag/health" | jq '.'
echo ""

echo -e "${YELLOW}1d. Billing health check:${NC}"
curl -s "$BASE_URL/api/billing/health" | jq '.'
echo ""

echo -e "${BLUE}=== 2. Motivation Endpoint (No Auth) ===${NC}"
echo ""

echo -e "${YELLOW}2a. Get random uplifting message:${NC}"
curl -s "$BASE_URL/api/motivation" | jq '.'
echo ""

echo -e "${BLUE}=== 3. Session-Based Auth Flow (Web) ===${NC}"
echo ""

echo -e "${YELLOW}3a. Test login (dev only):${NC}"
TEST_PASSWORD="${TEST_LOGIN_PASSWORD:-test-password}"
SESSION_COOKIE=$(curl -s -c - "$BASE_URL/api/auth/test-login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$TEST_PASSWORD\"}" \
  | grep -oP 'connect.sid\s+\K\S+')

if [ -n "$SESSION_COOKIE" ]; then
  echo -e "${GREEN}✓ Session cookie obtained${NC}"
  echo ""
  
  echo -e "${YELLOW}3b. RAG query with session auth:${NC}"
  curl -s -X POST "$BASE_URL/api/rag/answer" \
    -H 'Content-Type: application/json' \
    -H "Cookie: connect.sid=$SESSION_COOKIE" \
    -d '{"question":"What are common EDS symptoms?","window":"30d"}' \
    -i | head -20
  echo ""
  
  echo -e "${YELLOW}3c. Check X-Queries-Left header (session auth):${NC}"
  curl -s -X POST "$BASE_URL/api/rag/answer" \
    -H 'Content-Type: application/json' \
    -H "Cookie: connect.sid=$SESSION_COOKIE" \
    -d '{"question":"How do I manage POTS?","window":"7d"}' \
    -I | grep -i "x-queries-left"
  echo ""
else
  echo -e "${YELLOW}⚠ Could not obtain session cookie (TEST_LOGIN_PASSWORD may not be set)${NC}"
  echo ""
fi

echo -e "${BLUE}=== 4. Firebase Bearer Token Auth Flow (Mobile) ===${NC}"
echo ""

if [ -n "$FIREBASE_TOKEN" ]; then
  echo -e "${YELLOW}4a. RAG query with Firebase auth:${NC}"
  curl -s -X POST "$BASE_URL/api/rag/answer" \
    -H "Authorization: Bearer $FIREBASE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"question":"What is EDS?","window":"30d"}' \
    | jq '.'
  echo ""
  
  echo -e "${YELLOW}4b. Check X-Queries-Left header (Firebase auth):${NC}"
  curl -s -X POST "$BASE_URL/api/rag/answer" \
    -H "Authorization: Bearer $FIREBASE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"question":"Tips for managing fatigue?","window":"30d"}' \
    -I | grep -i "x-queries-left"
  echo ""
  
  echo -e "${YELLOW}4c. Get billing status (Firebase auth):${NC}"
  curl -s "$BASE_URL/api/billing/status" \
    -H "Authorization: Bearer $FIREBASE_TOKEN" \
    | jq '.'
  echo ""
  
  echo -e "${YELLOW}4d. Create checkout session (Firebase auth):${NC}"
  curl -s -X POST "$BASE_URL/api/billing/create-checkout-session" \
    -H "Authorization: Bearer $FIREBASE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"trialMonths":0}' \
    | jq '.'
  echo ""
else
  echo -e "${YELLOW}⚠ FIREBASE_ID_TOKEN not set. To test Firebase auth:${NC}"
  echo ""
  echo "# 1. Get Firebase ID token:"
  echo "curl -s 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_FIREBASE_API_KEY' \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"email\":\"test@example.com\",\"password\":\"yourpass\",\"returnSecureToken\":true}' \\"
  echo "  | jq -r .idToken"
  echo ""
  echo "# 2. Export the token:"
  echo "export FIREBASE_ID_TOKEN='<token-from-step-1>'"
  echo ""
  echo "# 3. Run this script again"
  echo ""
fi

echo -e "${BLUE}=== 5. CORS Verification ===${NC}"
echo ""

echo -e "${YELLOW}5a. Test CORS preflight (OPTIONS):${NC}"
curl -s -X OPTIONS "$BASE_URL/api/rag/answer" \
  -H "Origin: https://app.zebbysworld.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -I | grep -i "access-control"
echo ""

echo -e "${GREEN}=================================================="
echo "Test suite complete!"
echo "==================================================${NC}"
echo ""
echo "Environment variables used:"
echo "  BASE_URL: $BASE_URL"
echo "  TEST_LOGIN_PASSWORD: ${TEST_LOGIN_PASSWORD:+[set]}"
echo "  FIREBASE_ID_TOKEN: ${FIREBASE_TOKEN:+[set]}"
echo ""
