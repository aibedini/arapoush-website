# OPEX PHP reference client (for AraCMS)

A minimal PHP 8.3 client for the OPEX Partner API. It covers:
- OAuth 2.1 sign-in (authorization code with PKCE, `private_key_jwt`) with DPoP-bound tokens;
- RFC 9421 request signatures and idempotency keys;
- content reads, media uploads and change requests;
- previews and webhook verification.

The full guide is [`docs/opex/aracms-integration.md`](../../docs/opex/aracms-integration.md).

```bash
composer install
composer test
```

```php
use Arapoush\Opex\{Es256, OpexClient, Webhook};

$opex = new OpexClient('https://opex.example.com', 'aracms_xxx',
    file_get_contents('/etc/aracms/opex-client.pem'), 'aracms-1',
    file_get_contents('/etc/aracms/opex-dpop.pem'));

[$url, $verifier, $state] = $opex->authorizationUrl('https://cms.example.com/opex/callback', ['content:read', 'content:propose', 'media:upload', 'cr:read', 'cr:withdraw']);
// … after the redirect back:
$opex->exchangeCode($_GET['code'], 'https://cms.example.com/opex/callback', $verifier);

$draft = $opex->content('page.printing');
$cr = $opex->proposeChange('Fix title', [[
    'entry' => 'page.printing', 'base_revision_id' => $draft['base_revision_id'],
    'path' => '/hero/title', 'locale' => 'en', 'value' => 'ARAPOUSH Tube Printing',
]], endUserIp: $_SERVER['REMOTE_ADDR']);
```

| File | What |
|---|---|
| `src/OpexClient.php` | Tokens, DPoP proofs, signed writes, every Partner API call |
| `src/RequestSigner.php` | RFC 9421 signature base and signing, Content-Digest |
| `src/Webhook.php` | `OPEX-Signature` verification (HMAC, ±5 min) |
| `src/Es256.php` | P-256 keys, raw ECDSA signatures, JWK and thumbprints (ext-openssl only) |
| `tests/vectors.json` | Produced by the OPEX server code; both test suites check it |
