import { Page } from '@playwright/test';

export async function devLogin(page: Page, email: string) {
  const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
  const pw = process.env.TEST_LOGIN_PASSWORD || 'letmein';
  
  const response = await page.request.post(`${base}/api/auth/test-login`, {
    headers: { 
      'x-test-login-password': pw, 
      'content-type': 'application/json' 
    },
    data: { email }
  });
  
  const json = await response.json();
  
  if (!json.ok || !json.user) {
    const responseText = await response.text().catch(() => JSON.stringify(json));
    throw new Error(`Test login failed: ${responseText}`);
  }
  
  // Get the session cookie from the response
  const headersArray = response.headersArray();
  const setCookieHeaders = headersArray.filter(h => h.name.toLowerCase() === 'set-cookie');
  
  // Derive domain from base URL
  const baseUrl = new URL(base);
  const domain = baseUrl.hostname;
  
  let cookieSet = false;
  for (const header of setCookieHeaders) {
    // Look for connect.sid cookie
    if (header.value.includes('connect.sid=')) {
      const cookieParts = header.value.split(';')[0].split('=');
      if (cookieParts[0] === 'connect.sid' && cookieParts[1]) {
        await page.context().addCookies([
          {
            name: 'connect.sid',
            value: cookieParts[1],
            domain,
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
          }
        ]);
        cookieSet = true;
        break;
      }
    }
  }
  
  if (!cookieSet) {
    throw new Error(`No connect.sid cookie found in test-login response. Ensure SESSION_SECRET is set and session store is configured.`);
  }
  
  await page.goto(base);
  await page.waitForTimeout(500);
}
