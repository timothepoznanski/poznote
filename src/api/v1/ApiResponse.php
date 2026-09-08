<?php
/**
 * The one way an API v1 controller emits a response.
 *
 * This used to be a private sendJson() copied into TrashController and
 * FoldersController, and the two copies had already drifted: one pretty-printed
 * its payload and the other did not. Keeping a single definition is the point.
 *
 * Content-Type is set once in api/v1/index.php, so it is not repeated here.
 *
 * The rest of the controllers still `echo json_encode(...)` directly. Prefer
 * this helper in new code: it is the only place that guarantees the status code
 * and the body travel together, which is what a client needs to distinguish a
 * failure from an empty result.
 */

if (!function_exists('apiSendJson')) {
    function apiSendJson(array $data, int $code = 200): void
    {
        http_response_code($code);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }
}
