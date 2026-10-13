import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { oauthAuthenticator } from '../src/gateway.mjs';

test('OAuth JWT rejects wrong audience, unauthorized subjects, missing scope, and expiry', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const issuer = 'https://issuer.example/'; const audience = 'https://gateway.example/mcp';
  const auth = oauthAuthenticator({ issuer, audience, subjects: ['owner'], verificationKey: publicKey });
  const signed = async ({ sub = 'owner', aud = audience, scope = 'flow', expiry = '5m' } = {}) => {
    const token = await new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256' }).setSubject(sub).setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
    return { headers: { authorization: `Bearer ${token}` } };
  };
  assert.equal(await auth(await signed()), 'owner');
  for (const claims of [{ sub: 'stranger' }, { aud: 'wrong' }, { scope: '' }, { expiry: 1 }]) await assert.rejects(auth(await signed(claims)));
  await assert.rejects(auth({ headers: {} }));
});
