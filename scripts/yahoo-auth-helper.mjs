import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const clientId = process.env.YAHOO_CLIENT_ID;
const clientSecret = process.env.YAHOO_CLIENT_SECRET;
const redirectUri = process.env.YAHOO_REDIRECT_URI;
const port = Number(process.env.YAHOO_AUTH_PORT ?? 8787);
const state = randomBytes(24).toString('hex');

const saveEnvValue = async (name, value) => {
  let env = '';
  try {
    env = await readFile('.env', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.trimEnd()}\n${line}\n`;
  await writeFile('.env', env, { mode: 0o600 });
};

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error('Set YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, and YAHOO_REDIRECT_URI before running npm run yahoo:auth.');
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://localhost:${port}`);
  if (requestUrl.pathname !== '/oauth/callback') {
    response.writeHead(404).end('Not found');
    return;
  }
  if (requestUrl.searchParams.get('state') !== state) {
    response.writeHead(400).end('Invalid OAuth state. Restart the helper and try again.');
    return;
  }
  const code = requestUrl.searchParams.get('code');
  if (!code) {
    response.writeHead(400).end(`Yahoo authorization failed: ${requestUrl.searchParams.get('error') ?? 'missing code'}`);
    return;
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    response.writeHead(502).end(`Yahoo token exchange failed: ${JSON.stringify(tokenData)}`);
    return;
  }
  await saveEnvValue('YAHOO_ACCESS_TOKEN', tokenData.access_token);
  if (tokenData.refresh_token) await saveEnvValue('YAHOO_REFRESH_TOKEN', tokenData.refresh_token);
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Yahoo authorization complete. Tokens were saved locally. You can close this tab.');
  console.log('\nYahoo authorization complete. Tokens saved to the local .env file.\n');
  console.log(`Access token: ${tokenData.access_token.slice(0, 8)}...`);
  console.log('Keep your .env file private.\n');
  server.close();
});

server.listen(port, '127.0.0.1', () => {
  const authorizationUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('state', state);
  console.log(`OAuth helper listening on http://127.0.0.1:${port}`);
  console.log(`Open this URL after your HTTPS tunnel is running:\n\n${authorizationUrl}\n`);
});