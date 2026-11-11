<?php

declare(strict_types=1);

namespace Arapoush\Opex;

/**
 * Verifies OPEX webhooks: `OPEX-Signature: t=<unix>, v1=<hex HMAC-SHA256(secret, t + "." + body)>`.
 * Use the raw request body (php://input), not a re-encoded array.
 *
 *   $event = Webhook::verify($secret, $_SERVER['HTTP_OPEX_SIGNATURE'] ?? null, file_get_contents('php://input'));
 *   if ($event === null || $seenBefore($event['id'])) { http_response_code(401); exit; }
 */
final class Webhook
{
    public const TOLERANCE = 300;

    /** @return array<string,mixed>|null the decoded event, or null when the signature is not valid */
    public static function verify(string $secret, ?string $header, string $body, ?int $now = null): ?array
    {
        if ($header === null || !preg_match('/^t=(\d{1,12}),\s*v1=([0-9a-f]{64})$/', $header, $m)) {
            return null;
        }
        $t = (int) $m[1];
        if (abs(($now ?? time()) - $t) > self::TOLERANCE) {
            return null;
        }
        $expected = hash_hmac('sha256', $t . '.' . $body, $secret);
        if (!hash_equals($expected, $m[2])) {
            return null;
        }
        $event = json_decode($body, true);
        return is_array($event) && isset($event['id'], $event['event']) ? $event : null;
    }
}
