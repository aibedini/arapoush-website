<?php

declare(strict_types=1);

namespace Arapoush\Opex;

use OpenSSLAsymmetricKey;
use RuntimeException;

/**
 * ES256 (ECDSA P-256 + SHA-256) helpers on top of ext-openssl: raw r||s signatures (as JWS and
 * RFC 9421 require), public JWKs and RFC 7638 thumbprints. No other crypto dependency.
 */
final class Es256
{
    public static function loadPrivateKey(string $pem): OpenSSLAsymmetricKey
    {
        $key = openssl_pkey_get_private($pem);
        if ($key === false) {
            throw new RuntimeException('Invalid private key PEM');
        }
        $d = openssl_pkey_get_details($key);
        if (($d['type'] ?? null) !== OPENSSL_KEYTYPE_EC || ($d['ec']['curve_name'] ?? '') !== 'prime256v1') {
            throw new RuntimeException('The key must be an EC P-256 key');
        }
        return $key;
    }

    /** Creates a new P-256 key pair; returns the private key PEM. */
    public static function generate(): string
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        if ($key === false || !openssl_pkey_export($key, $pem)) {
            throw new RuntimeException('Could not generate a P-256 key');
        }
        return $pem;
    }

    /** Signs and returns the 64-byte raw signature (r||s). */
    public static function sign(string $data, OpenSSLAsymmetricKey $key): string
    {
        if (!openssl_sign($data, $der, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Signing failed');
        }
        return self::derToRaw($der);
    }

    public static function verify(string $data, string $raw, OpenSSLAsymmetricKey $publicKey): bool
    {
        return openssl_verify($data, self::rawToDer($raw), $publicKey, OPENSSL_ALGO_SHA256) === 1;
    }

    /** @return array{kty:string,crv:string,x:string,y:string} */
    public static function publicJwk(OpenSSLAsymmetricKey $key): array
    {
        $ec = openssl_pkey_get_details($key)['ec'];
        return ['kty' => 'EC', 'crv' => 'P-256', 'x' => self::b64u(str_pad($ec['x'], 32, "\0", STR_PAD_LEFT)), 'y' => self::b64u(str_pad($ec['y'], 32, "\0", STR_PAD_LEFT))];
    }

    /** RFC 7638 JWK thumbprint (used as the DPoP key id). */
    public static function thumbprint(array $jwk): string
    {
        return self::b64u(hash('sha256', json_encode(['crv' => $jwk['crv'], 'kty' => $jwk['kty'], 'x' => $jwk['x'], 'y' => $jwk['y']], JSON_UNESCAPED_SLASHES), true));
    }

    public static function b64u(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    public static function derToRaw(string $der): string
    {
        // SEQUENCE { INTEGER r, INTEGER s }
        $pos = 2;
        if (ord($der[1]) & 0x80) {
            $pos += ord($der[1]) & 0x7f;
        }
        $out = '';
        for ($i = 0; $i < 2; $i++) {
            if (ord($der[$pos]) !== 0x02) {
                throw new RuntimeException('Bad DER signature');
            }
            $len = ord($der[$pos + 1]);
            $int = substr($der, $pos + 2, $len);
            $out .= str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
            $pos += 2 + $len;
        }
        return $out;
    }

    public static function rawToDer(string $raw): string
    {
        if (strlen($raw) !== 64) {
            return '';
        }
        $int = static function (string $v): string {
            $v = ltrim($v, "\0");
            if ($v === '' || (ord($v[0]) & 0x80)) {
                $v = "\0" . $v;
            }
            return "\x02" . chr(strlen($v)) . $v;
        };
        $body = $int(substr($raw, 0, 32)) . $int(substr($raw, 32));
        return "\x30" . chr(strlen($body)) . $body;
    }
}
