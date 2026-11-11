<?php

declare(strict_types=1);

namespace Arapoush\Opex\Tests;

use Arapoush\Opex\Es256;
use Arapoush\Opex\OpexClient;
use Arapoush\Opex\RequestSigner;
use Arapoush\Opex\Webhook;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;

/**
 * vectors.json is produced by the OPEX server code (apps/opex-api), so these tests prove the PHP and
 * Node sides build byte-identical signature bases and webhook signatures.
 */
final class ClientTest extends TestCase
{
    private static function v(): array
    {
        return json_decode(file_get_contents(__DIR__ . '/vectors.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    public function testSignatureBaseMatchesTheServer(): void
    {
        $v = self::v();
        $this->assertSame($v['headers']['content-digest'], RequestSigner::contentDigest($v['body']));
        $this->assertSame($v['base'], RequestSigner::signatureBase('POST', '/v1/partner/change-requests', $v['headers'], $v['components'], $v['params']));
    }

    public function testSignedRequestVerifiesWithThePublicKey(): void
    {
        $pem = Es256::generate();
        $key = Es256::loadPrivateKey($pem);
        $signer = new RequestSigner($key, 'aracms-1');
        $h = $signer->sign('POST', '/v1/partner/change-requests', ['idempotency-key' => 'abcdefabcdefabcdef', 'x-end-user-ip' => '198.51.100.7'], '{"a":1}', 1800000000, '0123456789abcdef01234567');
        $this->assertStringContainsString('"x-end-user-ip"', $h['signature-input']);
        preg_match('/^sig1=(.*)$/', $h['signature-input'], $m);
        $base = RequestSigner::signatureBase('POST', '/v1/partner/change-requests', $h, ['@method', '@path', 'idempotency-key', 'content-digest', 'x-end-user-ip'], $m[1]);
        $raw = base64_decode(substr($h['signature'], 6, -1));
        $this->assertSame(64, strlen($raw));
        $public = openssl_pkey_get_public(openssl_pkey_get_details($key)['key']);
        $this->assertTrue(Es256::verify($base, $raw, $public));
        $this->assertFalse(Es256::verify($base . 'x', $raw, $public));
    }

    public function testWebhookVerification(): void
    {
        $w = self::v()['webhook'];
        $event = Webhook::verify($w['secret'], $w['header'], $w['body'], $w['t']);
        $this->assertSame('cr.state_changed', $event['event']);
        $this->assertNull(Webhook::verify($w['secret'], $w['header'], $w['body'] . ' ', $w['t']), 'body changed');
        $this->assertNull(Webhook::verify('another-secret', $w['header'], $w['body'], $w['t']), 'wrong secret');
        $this->assertNull(Webhook::verify($w['secret'], $w['header'], $w['body'], $w['t'] + 301), 'too old');
        $this->assertNull(Webhook::verify($w['secret'], null, $w['body'], $w['t']));
    }

    public function testDerAndRawSignaturesRoundTrip(): void
    {
        $key = Es256::loadPrivateKey(Es256::generate());
        for ($i = 0; $i < 20; $i++) {
            $raw = Es256::sign("message $i", $key);
            $this->assertSame($raw, Es256::derToRaw(Es256::rawToDer($raw)));
        }
    }

    public function testClientSendsDpopSignatureAndIdempotencyOnWrites(): void
    {
        $history = [];
        $mock = new MockHandler([
            new Response(200, [], json_encode(['access_token' => 'at-1', 'token_type' => 'DPoP', 'expires_in' => 300, 'refresh_token' => 'rt-1'])),
            new Response(201, [], json_encode(['id' => 'cr_1', 'state' => 'pending_review'])),
        ]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        $client = new OpexClient('https://opex.test', 'aracms_1', Es256::generate(), 'aracms-1', Es256::generate(), new Client(['handler' => $stack, 'http_errors' => false]));
        $client->clientCredentials(['content:propose']);
        $cr = $client->proposeChange('Fix', [['entry' => 'page.printing', 'base_revision_id' => 'rev_1', 'path' => '/hero/title', 'locale' => 'en', 'value' => 'آراپوش']], endUserIp: '203.0.113.9');
        $this->assertSame('cr_1', $cr['id']);

        $token = $history[0]['request'];
        parse_str((string) $token->getBody(), $form);
        $this->assertSame('urn:ietf:params:oauth:client-assertion-type:jwt-bearer', $form['client_assertion_type']);
        $this->assertNotEmpty($token->getHeaderLine('DPoP'));

        $req = $history[1]['request'];
        $this->assertSame('DPoP at-1', $req->getHeaderLine('Authorization'));
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $req->getHeaderLine('Idempotency-Key'));
        $this->assertSame(RequestSigner::contentDigest((string) $req->getBody()), $req->getHeaderLine('Content-Digest'));
        $this->assertStringContainsString('"x-end-user-ip"', $req->getHeaderLine('Signature-Input'));
        $this->assertStringContainsString('آراپوش', (string) $req->getBody(), 'UTF-8 is sent as is');
        [, $payload] = explode('.', $req->getHeaderLine('DPoP'));
        $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
        $this->assertSame('https://opex.test/v1/partner/change-requests', $claims['htu']);
        $this->assertSame(Es256::b64u(hash('sha256', 'at-1', true)), $claims['ath']);
    }
}
