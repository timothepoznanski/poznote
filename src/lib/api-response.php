<?php
/**
 * The one way an API v1 controller emits a response.
 *
 * This used to be a private sendJson() copied into TrashController and
 * FoldersController, and the two copies had already drifted: one pretty-printed
 * its payload and the other did not. Keeping a single definition is the point.
 *
 * Content-Type is set once by the caller (api/v1/index.php for the REST API),
 * so it is not repeated here.
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

if (!function_exists('apiFail')) {
    /**
     * Refuses a request with a status code AND the reason in the body.
     *
     * The legacy api_*.php endpoints used to answer `{"success": false,
     * "error": "..."}` with HTTP 200, so a client checking the status saw a
     * success. The body keeps exactly the shape it had, only the status code
     * changes, and the browser code reads that body before it reads the status.
     */
    function apiFail(string $error, int $code = 400): void
    {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    }
}

if (!function_exists('apiSuccess')) {
    /**
     * Answers a request that worked, merging the payload into {"success": true}.
     *
     * This body was built by a private sendSuccess() copied into six
     * controllers, and the copies had drifted: TasksController serialised with
     * JSON_UNESCAPED_UNICODE and the other five escaped every accent. Both parse
     * the same, but there is no reason for the same helper to disagree with
     * itself.
     */
    function apiSuccess(array $data): void
    {
        apiSendJson(array_merge(['success' => true], $data));
    }
}
