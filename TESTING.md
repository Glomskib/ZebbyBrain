# Zebby's World - Testing Guide

## Quick Start

This guide helps you test Zebby's World features locally and in production.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (provided by Replit)
- Required environment secrets configured (see below)

## Local Development Testing

### 1. Start the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5000`

### 2. Smoke Tests

Run these curl commands to verify API endpoints:

```bash
# Health check
curl -s http://localhost:5000/api/rag/health

# Uplifting message (motivation API)
curl -s http://localhost:5000/api/motivation
```

### 3. UI Feature Verification

1. **Navigation Labels** - Check that the nav shows:
   - "Pastures" (not "Groups")
   - "Spoonies" (not "Personal Circle")  
   - "Zebby's Pouch" (not "Marketplace")
   - "Ask Zebby"

2. **Legacy Route Redirects** - Test these URLs preserve query params:
   - `/store?ref=kickstarter` → `/marketplace?ref=kickstarter`
   - `/pastures?campaign=2025` → `/groups?campaign=2025`
   - `/spoonies?source=email` → `/circle?source=email`
   - `/personal-circle?v=2` → `/circle?v=2`
   - `/zebbys-pouch?utm=test` → `/marketplace?utm=test`

3. **Ask Zebby** (requires VITE_FF_RAG=true):
   - Query counter shows "5" for new users
   - Counter decrements after each question
   - Upgrade banner appears at 0 queries
   - Sources displayed with each answer

## Production Testing

### Required Secrets

Before deploying, configure these in Replit Secrets:

**Firebase Authentication** (for mobile apps):
```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**CORS Configuration**:
```
ALLOWED_ORIGINS=https://preview.flutterflow.app,https://app.zebbysworld.com,capacitor://localhost,ionic://localhost
```

**Feature Flags** (optional):
```
VITE_FF_RAG=true
FF_RAG=true
```

### Smoke Tests for Production

Replace `<your-domain>` with your actual domain:

```bash
# Health check
curl -s https://<your-domain>/api/rag/health

# Motivation endpoint
curl -s https://<your-domain>/api/motivation

# Firebase auth test (requires valid Firebase ID token)
curl -i -s -X POST https://<your-domain>/api/rag/answer \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are common EDS symptoms?","window":"30d"}'

# Stripe checkout (requires valid Firebase ID token)
curl -i -s -X POST https://<your-domain>/api/billing/create-checkout-session \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

## Postman Collection

Complete API documentation and test collection available at:
```
docs/zebby-api.postman_collection.json
```

Import this into Postman and configure environment variables:
- `baseUrl` - Your deployed domain
- `firebaseIdToken` - Valid Firebase ID token for testing

## Troubleshooting

### "Firebase auth unavailable" in logs
- Missing Firebase secrets (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
- Only needed for mobile app authentication

### "Feature Not Available" on Ask Zebby page
- Missing VITE_FF_RAG=true secret
- Feature flag controls RAG/AI Brain access

### Legacy redirects showing 404
- Clear browser cache
- Verify routes in client/src/App.tsx

### CORS errors
- Check ALLOWED_ORIGINS includes your mobile app origins
- Restart deployment after changing secrets

## Kickstarter Demo Script (60-90 seconds)

1. Open app → Show uplifting message banner
2. Navigate to Ask Zebby → Ask "What are common EDS symptoms?"
3. Show answer with sources
4. Ask 2-3 more questions until counter shows 0
5. Click "Upgrade to Zebby Plus" → Show Stripe checkout
6. Navigate through: Pastures, Spoonies, Zebby's Pouch
7. End with: "Cost controls keep it under pennies per user"

## Cost Monitoring

Watch RAG usage in logs:
```bash
grep "rag_usage" logs/*.log
```

Set OpenAI usage alerts at $20 and $50 in your OpenAI dashboard.

## Support

For issues or questions, check:
- `replit.md` - Project architecture
- Server logs in Replit console
- Browser console for client-side errors
