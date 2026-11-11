<?php

declare(strict_types=1);

namespace Arapoush\Opex;

use OpenSSLAsymmetricKey;

/**
 * HTTP Message Signatures (RFC 9421) as OPEX expects them on every partner write:
 * covers @method, @path, idempotency-key, content-digest (when there is a body) and
 * x-end-user-ip (when sent); alg ecdsa-p256-sha256; created now; a fresh nonce.
 */
final class RequestSigner
{
    public function __construct(private OpenSSLAsymmetricKey $key, private string $keyId)
    {
    }

    /** RFC 9530 Content-Digest of the exact body bytes. */
    public static function contentDigest(string $body): string
    {
        return 'sha-256=:' . base64_encode(hash('sha256', $body, true)) . ':';
    }

    /**
     * @param array<string,string> $headers lower-case names
     * @param list<string> $components
     */
    public static function signatureBase(string $method, string $path, array $headers, array $components, string $paramsRaw): string
    {
        $lines = [];
        foreach ($components as $c) {
            $lines[] = match ($c) {
                '@method' => '"@method": ' . strtoupper($method),
                '@path' => '"@path": ' . $path,
                default => '"' . $c . '": ' . trim($headers[$c] ?? throw new \InvalidArgumentException("Header $c is missing")),
            };
        }
        $lines[] = '"@signature-params": ' . $paramsRaw;
        return implode("\n", $lines);
    }

    /**
     * Adds Content-Digest, Signature-Input and Signature to $headers (lower-case names).
     *
     * @param array<string,string> $headers
     * @return array<string,string>
     */
    public function sign(string $method, string $path, array $headers, ?string $body, ?int $created = null, ?string $nonce = null): array
    {
        $components = ['@method', '@path', 'idempotency-key'];
        if ($body !== null && $body !== '') {
            $headers['content-digest'] = self::contentDigest($body);
            $components[] = 'content-digest';
        }
        if (isset($headers['x-end-user-ip'])) {
            $components[] = 'x-end-user-ip';
        }
        $paramsRaw = '(' . implode(' ', array_map(static fn ($c) => '"' . $c . '"', $components)) . ')'
            . ';created=' . ($created ?? time())
            . ';keyid="' . $this->keyId . '"'
            . ';alg="ecdsa-p256-sha256"'
            . ';nonce="' . ($nonce ?? bin2hex(random_bytes(16))) . '"';
        $base = self::signatureBase($method, $path, $headers, $components, $paramsRaw);
        $headers['signature-input'] = 'sig1=' . $paramsRaw;
        $headers['signature'] = 'sig1=:' . base64_encode(Es256::sign($base, $this->key)) . ':';
        return $headers;
    }
}
