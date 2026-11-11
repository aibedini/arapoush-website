<?php

declare(strict_types=1);

namespace Arapoush\Opex;

use GuzzleHttp\Client as Http;
use GuzzleHttp\ClientInterface;
use OpenSSLAsymmetricKey;

/**
 * OPEX Partner API client for AraCMS.
 *
 * Keys (generate once, keep on the AraCMS server only; register the PUBLIC client key in OPEX):
 *  - client key: authenticates AraCMS at the token endpoint (private_key_jwt) and signs write requests;
 *  - DPoP key: binds access tokens to this server, so a leaked token is useless elsewhere.
 *
 * Typical flow:
 *   $opex = new OpexClient('https://opex.example.com', 'aracms_xxx', $clientPem, 'aracms-1', $dpopPem);
 *   [$url, $verifier, $state] = $opex->authorizationUrl('https://cms.example.com/opex/callback', ['content:read', 'content:propose']);
 *   // redirect the user to $url; OPEX asks for their password and authenticator code
 *   $opex->exchangeCode($_GET['code'], 'https://cms.example.com/opex/callback', $verifier);
 *   $draft = $opex->content('page.printing');
 *   $cr = $opex->proposeChange('Fix title', [[ 'entry' => 'page.printing', 'base_revision_id' => $draft['base_revision_id'],
 *            'path' => '/hero/title', 'locale' => 'en', 'value' => 'New title' ]], endUserIp: $_SERVER['REMOTE_ADDR']);
 */
final class OpexClient
{
    private OpenSSLAsymmetricKey $clientKey;
    private OpenSSLAsymmetricKey $dpopKey;
    private RequestSigner $signer;
    private ClientInterface $http;
    /** @var array{access_token?:string,refresh_token?:string,expires_at?:int} */
    private array $tokens = [];

    public function __construct(
        private string $baseUrl,
        private string $clientId,
        string $clientKeyPem,
        private string $keyId,
        string $dpopKeyPem,
        ?ClientInterface $http = null,
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->clientKey = Es256::loadPrivateKey($clientKeyPem);
        $this->dpopKey = Es256::loadPrivateKey($dpopKeyPem);
        $this->signer = new RequestSigner($this->clientKey, $keyId);
        $this->http = $http ?? new Http(['http_errors' => false, 'timeout' => 20, 'allow_redirects' => false]);
    }

    /** The JWK to register in OPEX for this client (public part only). */
    public function clientPublicJwk(): array
    {
        return Es256::publicJwk($this->clientKey) + ['kid' => $this->keyId, 'alg' => 'ES256', 'use' => 'sig'];
    }

    // ── OAuth 2.1 ──────────────────────────────────────────────────────────

    /** @return array{0:string,1:string,2:string} [url, code_verifier, state] — keep verifier and state in the user's session. */
    public function authorizationUrl(string $redirectUri, array $scopes, ?string $state = null): array
    {
        $verifier = Es256::b64u(random_bytes(32));
        $state ??= Es256::b64u(random_bytes(16));
        $q = http_build_query([
            'response_type' => 'code',
            'client_id' => $this->clientId,
            'redirect_uri' => $redirectUri,
            'scope' => implode(' ', $scopes),
            'state' => $state,
            'code_challenge' => Es256::b64u(hash('sha256', $verifier, true)),
            'code_challenge_method' => 'S256',
        ]);
        return ["{$this->baseUrl}/oauth/authorize?$q", $verifier, $state];
    }

    public function exchangeCode(string $code, string $redirectUri, string $verifier): array
    {
        return $this->token(['grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => $redirectUri, 'code_verifier' => $verifier]);
    }

    /** Machine access (no user): only what the client's own grants allow. */
    public function clientCredentials(array $scopes): array
    {
        return $this->token(['grant_type' => 'client_credentials', 'scope' => implode(' ', $scopes)]);
    }

    /** Refresh tokens rotate: store the new one. Reusing an old one ends the whole session. */
    public function refresh(): array
    {
        return $this->token(['grant_type' => 'refresh_token', 'refresh_token' => $this->tokens['refresh_token'] ?? '']);
    }

    /** Persist these per AraCMS user (encrypted at rest) and restore with withTokens(). */
    public function tokens(): array
    {
        return $this->tokens;
    }

    public function withTokens(array $tokens): self
    {
        $this->tokens = $tokens;
        return $this;
    }

    private function token(array $form): array
    {
        $url = "{$this->baseUrl}/oauth/token";
        $form += [
            'client_id' => $this->clientId,
            'client_assertion_type' => 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            'client_assertion' => $this->jwt(['alg' => 'ES256', 'typ' => 'JWT', 'kid' => $this->keyId], [
                'iss' => $this->clientId, 'sub' => $this->clientId, 'aud' => $url,
                'jti' => bin2hex(random_bytes(16)), 'iat' => time(), 'exp' => time() + 120,
            ], $this->clientKey),
        ];
        $res = $this->http->request('POST', $url, ['form_params' => $form, 'headers' => ['DPoP' => $this->dpopProof('POST', $url)]]);
        $body = json_decode((string) $res->getBody(), true) ?? [];
        if ($res->getStatusCode() !== 200) {
            throw new OpexException($res->getStatusCode(), (string) ($body['error'] ?? 'token_error'), ['detail' => $body['error_description'] ?? 'Token request failed']);
        }
        $this->tokens = [
            'access_token' => $body['access_token'],
            'refresh_token' => $body['refresh_token'] ?? ($this->tokens['refresh_token'] ?? null),
            'expires_at' => time() + (int) ($body['expires_in'] ?? 300) - 15,
        ];
        return $this->tokens;
    }

    // ── Partner API ────────────────────────────────────────────────────────

    public function me(): array { return $this->call('GET', '/v1/partner/me'); }
    public function schema(): array { return $this->call('GET', '/v1/partner/schema'); }
    /** Current draft projected to your grants, with base_revision_id for proposals. */
    public function content(string $type): array { return $this->call('GET', '/v1/partner/content/' . rawurlencode($type)); }
    public function history(string $type): array { return $this->call('GET', '/v1/partner/content/' . rawurlencode($type) . '/history'); }
    public function changeRequests(?string $state = null): array { return $this->call('GET', '/v1/partner/change-requests' . ($state ? '?state=' . rawurlencode($state) : '')); }
    public function changeRequest(string $id): array { return $this->call('GET', '/v1/partner/change-requests/' . rawurlencode($id)); }
    public function asset(string $id): array { return $this->call('GET', '/v1/partner/media/' . rawurlencode($id)); }

    /** Uploads a file; use the returned `asset` id in an image value: ['asset' => $id, 'alt' => ['fa' => '…']]. */
    public function uploadMedia(string $bytes, string $filename, ?string $endUserIp = null, ?string $idempotencyKey = null): array
    {
        return $this->call('POST', '/v1/partner/media', $bytes, ['content-type' => 'application/octet-stream', 'x-filename' => $filename], $endUserIp, $idempotencyKey);
    }

    /**
     * Proposes changes. Each item: entry, base_revision_id, path, [locale], [op = set|insert|remove], value.
     * Retrying with the same $idempotencyKey after a timeout is safe: OPEX replays the first answer.
     */
    public function proposeChange(string $title, array $items, ?string $note = null, ?string $endUserIp = null, ?string $idempotencyKey = null): array
    {
        return $this->call('POST', '/v1/partner/change-requests', json_encode(array_filter(['title' => $title, 'note' => $note, 'items' => $items], static fn ($v) => $v !== null), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), [], $endUserIp, $idempotencyKey);
    }

    public function withdraw(string $id, ?string $endUserIp = null): array
    {
        return $this->call('POST', '/v1/partner/change-requests/' . rawurlencode($id) . '/withdraw', null, [], $endUserIp);
    }

    /** After needs_rebase: re-read the content and send its new base revision per entry. */
    public function resubmit(string $id, array $baseRevisionIds, ?string $endUserIp = null): array
    {
        return $this->call('POST', '/v1/partner/change-requests/' . rawurlencode($id) . '/resubmit', json_encode(['base_revision_ids' => $baseRevisionIds], JSON_THROW_ON_ERROR), [], $endUserIp);
    }

    /** A 30-minute link to the website with the change request applied. */
    public function preview(string $crId, string $locale = 'fa'): string
    {
        return $this->call('POST', '/v1/partner/previews', json_encode(['cr' => $crId, 'locale' => $locale], JSON_THROW_ON_ERROR))['url'];
    }

    // ── Transport ──────────────────────────────────────────────────────────

    private function call(string $method, string $pathAndQuery, ?string $body = null, array $headers = [], ?string $endUserIp = null, ?string $idempotencyKey = null): array
    {
        if (($this->tokens['expires_at'] ?? 0) <= time() && isset($this->tokens['refresh_token'])) {
            $this->refresh();
        }
        $at = $this->tokens['access_token'] ?? throw new \LogicException('Sign in first (exchangeCode or clientCredentials)');
        $path = explode('?', $pathAndQuery, 2)[0];
        $url = $this->baseUrl . $pathAndQuery;
        $h = array_change_key_case($headers) + ['accept' => 'application/json', 'authorization' => "DPoP $at", 'dpop' => $this->dpopProof($method, $this->baseUrl . $path, $at)];
        if ($body !== null && !isset($h['content-type'])) {
            $h['content-type'] = 'application/json';
        }
        if ($method !== 'GET') {
            $h['idempotency-key'] = $idempotencyKey ?? self::uuid();
            if ($endUserIp !== null) {
                $h['x-end-user-ip'] = $endUserIp;
            }
            $h = $this->signer->sign($method, $path, $h, $body);
        }
        $res = $this->http->request($method, $url, ['headers' => $h, 'body' => $body]);
        $data = json_decode((string) $res->getBody(), true) ?? [];
        if ($res->getStatusCode() >= 400) {
            throw new OpexException($res->getStatusCode(), (string) ($data['code'] ?? $res->getStatusCode()), $data);
        }
        return $data;
    }

    /** DPoP proof (RFC 9449) for one request; `ath` binds it to the access token. */
    private function dpopProof(string $method, string $url, ?string $accessToken = null): string
    {
        $claims = ['htm' => strtoupper($method), 'htu' => $url, 'iat' => time(), 'jti' => bin2hex(random_bytes(16))];
        if ($accessToken !== null) {
            $claims['ath'] = Es256::b64u(hash('sha256', $accessToken, true));
        }
        return $this->jwt(['alg' => 'ES256', 'typ' => 'dpop+jwt', 'jwk' => Es256::publicJwk($this->dpopKey)], $claims, $this->dpopKey);
    }

    private function jwt(array $header, array $claims, OpenSSLAsymmetricKey $key): string
    {
        $flags = JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;
        $input = Es256::b64u(json_encode($header, $flags)) . '.' . Es256::b64u(json_encode($claims, $flags));
        return $input . '.' . Es256::b64u(Es256::sign($input, $key));
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
