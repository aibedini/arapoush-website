<?php

declare(strict_types=1);

namespace Arapoush\Opex;

use RuntimeException;

/** An RFC 9457 problem returned by OPEX. `code` is stable (e.g. GRANT_DENIED, CONFLICT_BASE_REVISION). */
final class OpexException extends RuntimeException
{
    /** @param array<string,mixed> $problem */
    public function __construct(public readonly int $status, public readonly string $problemCode, public readonly array $problem)
    {
        parent::__construct(($problem['detail'] ?? $problem['title'] ?? 'OPEX error') . " ($problemCode)", $status);
    }
}
