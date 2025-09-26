# Zebby's World Security Operations Runbook

## Overview

This runbook provides operational procedures for maintaining security, responding to incidents, and troubleshooting security-related issues in Zebby's World. It serves as the practical guide for day-to-day security operations.

## Pre-deployment Security Checklist

### Environment Setup
- [ ] Verify all required environment variables are set
- [ ] Confirm SESSION_SECRET is cryptographically strong (32+ characters)
- [ ] Validate STRIPE_WEBHOOK_SECRET matches Stripe dashboard
- [ ] Test DATABASE_URL connectivity
- [ ] Verify OpenAI API key has appropriate permissions

### Security Configuration Verification
- [ ] Confirm CSP headers are properly configured
- [ ] Test authentication flows end-to-end
- [ ] Validate rate limiting is active
- [ ] Check CORS origins are restrictive
- [ ] Verify session security settings

### Application Security Tests
- [ ] Authentication bypass attempts fail
- [ ] Protected routes require valid sessions
- [ ] Payment endpoints validate webhooks
- [ ] Export endpoints set cache-control headers
- [ ] Error responses don't leak sensitive data

## Daily Operations

### Security Monitoring

#### Morning Security Check
```bash
# Check application health
curl -f http://localhost:5000/api/health

# Verify authentication endpoint
curl -f http://localhost:5000/api/auth/user
# Should return 401 Unauthorized when not authenticated

# Check rate limiting
for i in {1..10}; do curl -f http://localhost:5000/api/auth/user; done
# Should eventually return 429 Too Many Requests
```

#### Log Monitoring
```bash
# Check for authentication failures
grep "401" logs/server.log | tail -20

# Monitor failed payment attempts
grep "stripe.*error" logs/server.log | tail -10

# Check for unusual access patterns
grep "404\|403" logs/server.log | tail -20
```

### Database Security

#### Session Cleanup
```sql
-- Check active sessions (development database only)
SELECT COUNT(*) FROM sessions WHERE expire > NOW();

-- Clean up expired sessions (automatic, but can be monitored)
DELETE FROM sessions WHERE expire <= NOW();
```

#### User Data Monitoring
```sql
-- Check for unusual user creation patterns
SELECT DATE(created_at), COUNT(*) 
FROM users 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at);

-- Monitor health data access
SELECT user_id, COUNT(*) as log_count
FROM symptom_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id 
ORDER BY log_count DESC 
LIMIT 10;
```

## Incident Response Procedures

### Security Incident Classification

#### Level 1: Low Impact
- Single failed authentication
- Normal rate limiting triggers
- Expected 404 errors

**Response**: Monitor, no immediate action required

#### Level 2: Medium Impact
- Multiple failed authentication attempts from same IP
- Unusual API access patterns
- Payment webhook verification failures

**Response Time**: 1 hour

#### Level 3: High Impact
- Authentication bypass attempts
- Unauthorized data access
- Payment security violations
- Mass failed authentication

**Response Time**: 15 minutes

### Incident Response Steps

#### 1. Detection & Initial Assessment
```bash
# Quick security status check
curl -f http://localhost:5000/api/health

# Check recent error patterns
tail -100 logs/server.log | grep -E "error|unauthorized|forbidden"

# Monitor active connections
netstat -an | grep :5000
```

#### 2. Immediate Containment
```bash
# If under attack, implement emergency rate limiting
# (Modify rate limit in server/index.ts and restart)

# Block suspicious IPs if possible
# (Update CORS origins or implement IP filtering)

# Check user sessions for compromise
# Review recent authentication logs
```

#### 3. Investigation
```bash
# Analyze attack patterns
grep -E "401|403|429" logs/server.log | tail -50

# Check for data access anomalies
grep "export" logs/server.log | tail -20

# Review payment-related events
grep "stripe" logs/server.log | tail -30
```

#### 4. Recovery & Hardening
- Update security configurations if vulnerabilities found
- Rotate secrets if compromise suspected
- Document lessons learned
- Update monitoring based on incident patterns

## Troubleshooting Common Issues

### Authentication Problems

#### "Unauthorized" errors for valid users
```bash
# Check session store connectivity
# Verify DATABASE_URL connection
# Check session configuration in server/index.ts

# Validate OIDC configuration
echo $OIDC_ISSUER_URL
echo $OIDC_CLIENT_ID
```

#### Session persistence issues
```bash
# Check session table structure
psql $DATABASE_URL -c "\d sessions"

# Verify session cleanup isn't too aggressive
# Check session expiration settings
```

### Payment Security Issues

#### Stripe webhook failures
```bash
# Verify webhook secret
echo $STRIPE_WEBHOOK_SECRET | wc -c  # Should be > 30 characters

# Check webhook endpoint accessibility
curl -X POST http://localhost:5000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return 400 Bad Request with signature error
```

#### Payment authentication bypasses
```bash
# Test payment endpoint protection
curl -X POST http://localhost:5000/api/billing/create-subscription \
  -H "Content-Type: application/json" \
  -d '{"priceId": "test"}'
# Should return 401 Unauthorized
```

### Data Export Security

#### Cache control issues
```bash
# Test export cache headers
curl -I -X POST http://localhost:5000/api/export/csv \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer valid-token" \
  -d '{"dateRange": "week"}'
# Should include Cache-Control: no-store
```

## Maintenance Procedures

### Weekly Security Tasks

#### Secret Validation
```bash
# Verify all required secrets are present
node -e "
const required = ['SESSION_SECRET', 'STRIPE_WEBHOOK_SECRET', 'DATABASE_URL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing secrets:', missing);
  process.exit(1);
}
console.log('All required secrets present');
"
```

#### Security Header Testing
```bash
# Test security headers
curl -I http://localhost:5000/ | grep -E "X-|Content-Security|Strict-Transport"

# Verify CSP policy
curl -I http://localhost:5000/ | grep "Content-Security-Policy"
```

### Monthly Security Tasks

#### Dependency Security Audit
```bash
# Check for security vulnerabilities
npm audit

# Review outdated packages
npm outdated

# Update security-critical packages
npm update helmet express-rate-limit
```

#### Access Review
```sql
-- Review user access patterns (development database)
SELECT user_id, COUNT(*) as login_count
FROM user_sessions_log  -- If exists
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id 
ORDER BY login_count DESC;

-- Check for dormant accounts
SELECT id, email, last_login
FROM users 
WHERE last_login < NOW() - INTERVAL '90 days'
ORDER BY last_login;
```

## Emergency Procedures

### Immediate Security Shutdown
```bash
# Stop application
pkill -f "node.*server"

# Block all traffic (if load balancer available)
# Update DNS to maintenance page

# Preserve logs for analysis
cp -r logs/ security-incident-$(date +%Y%m%d-%H%M%S)/
```

### Secret Rotation Emergency
```bash
# Generate new session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update environment variables
# Restart application
# Monitor for authentication issues
```

### Database Security Emergency
```bash
# Create database backup
pg_dump $DATABASE_URL > emergency-backup-$(date +%Y%m%d-%H%M%S).sql

# Review recent database connections
# Check for unauthorized access patterns
# Implement emergency access restrictions
```

## Performance Monitoring

### Security-Related Performance Metrics

#### Authentication Performance
```bash
# Monitor authentication response times
curl -w "@curl-format.txt" -s -o /dev/null http://localhost:5000/api/auth/user

# Check session store performance
time psql $DATABASE_URL -c "SELECT COUNT(*) FROM sessions;"
```

#### Rate Limiting Effectiveness
```bash
# Monitor rate limit triggers
grep "429" logs/server.log | wc -l

# Check legitimate vs. blocked requests ratio
grep -E "200|401|429" logs/server.log | tail -100 | sort | uniq -c
```

## Security Configuration Management

### Environment Variable Management
```bash
# Validate production environment
if [ "$NODE_ENV" = "production" ]; then
  echo "Production environment detected"
  # Add production-specific security checks
fi

# Check environment variable security
env | grep -E "SECRET|KEY|TOKEN" | wc -l
```

### Security Settings Backup
```bash
# Backup current security configuration
cp server/index.ts config-backup-$(date +%Y%m%d).ts
cp package.json package-backup-$(date +%Y%m%d).json
```

## Contact Information

### Security Team Contacts
- **Primary Security Contact**: [Development Team]
- **Emergency Escalation**: [Operations Team]
- **Compliance Questions**: [Legal/Compliance Team]

### External Security Resources
- **Stripe Security**: https://stripe.com/docs/security
- **Node.js Security**: https://nodejs.org/en/security/
- **OWASP Guidelines**: https://owasp.org/

---

**Document Information**
- **Last Updated**: September 2025
- **Version**: 1.0
- **Next Review**: December 2025
- **Owner**: Development Team

## Appendix

### Security Commands Quick Reference
```bash
# Health check
curl -f http://localhost:5000/api/health

# Authentication test
curl -f http://localhost:5000/api/auth/user

# Rate limit test
for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/auth/user; done

# Security headers check
curl -I http://localhost:5000/ | grep -E "X-|Content-Security|Cache-Control"

# Log monitoring
tail -f logs/server.log | grep -E "error|unauthorized|401|403|429"
```

### Common Security Patterns
- Always validate authentication before sensitive operations
- Use parameterized queries to prevent SQL injection
- Implement proper error handling without information disclosure
- Log security events for monitoring and forensics
- Rotate secrets regularly and securely