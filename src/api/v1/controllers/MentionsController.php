<?php
/**
 * Mentions Controller
 *
 * "@username" in a note of a shared workspace (discussion #1621, see
 * lib/mentions.php). The notes that name the person signed in are read from
 * every shared workspace they are a member of, whichever account is open:
 * these endpoints answer for the login, not for the active account.
 */
require_once __DIR__ . '/../../../lib/mentions.php';

class MentionsController
{
    private PDO $con;

    public function __construct(PDO $con)
    {
        $this->con = $con;
    }

    /**
     * GET /api/v1/mentions
     *
     * The notes waiting for the person signed in. include_handled=1 adds the
     * ones they marked as handled.
     */
    public function index(): void
    {
        $userId = $this->loginUserId();
        if ($userId <= 0) {
            $this->sendError(401, 'Authentication required');
            return;
        }

        $includeHandled = ($_GET['include_handled'] ?? '') === '1';
        $mentions = poznoteCollectMentions($userId, $includeHandled);
        $open = 0;
        foreach ($mentions as $mention) {
            if (!$mention['handled']) {
                $open++;
            }
        }

        echo json_encode([
            'success' => true,
            'open' => $open,
            'mentions' => $mentions,
        ]);
    }

    /**
     * GET /api/v1/mentions/members
     *
     * Usernames that can be mentioned in a workspace of the active account,
     * its owner first. Empty when the workspace is shared with nobody.
     */
    public function members(): void
    {
        $workspace = isset($_GET['workspace']) && is_string($_GET['workspace']) ? trim($_GET['workspace']) : '';
        $ownerUserId = (int)(getCurrentUserId() ?? 0);
        if ($workspace === '' || $ownerUserId <= 0) {
            $this->sendError(400, 'workspace is required');
            return;
        }

        echo json_encode([
            'success' => true,
            'workspace' => $workspace,
            'members' => poznoteMentionMembers($ownerUserId, $workspace),
        ]);
    }

    /**
     * POST   /api/v1/mentions/{ownerId}/{noteId}/handled
     * DELETE /api/v1/mentions/{ownerId}/{noteId}/handled
     *
     * The person signed in has dealt with what a note asked of them, or
     * takes that back.
     */
    public function setHandled(string $ownerId, string $noteId, bool $handled): void
    {
        $userId = $this->loginUserId();
        if ($userId <= 0) {
            $this->sendError(401, 'Authentication required');
            return;
        }
        if (!ctype_digit($ownerId) || !ctype_digit($noteId)) {
            $this->sendError(400, 'Invalid mention');
            return;
        }

        try {
            if (!poznoteSetMentionHandled($userId, (int)$ownerId, (int)$noteId, $handled)) {
                $this->sendError(404, 'This note does not mention you');
                return;
            }
        } catch (Throwable $e) {
            error_log('Poznote: mention state not saved: ' . $e->getMessage());
            $this->sendError(500, 'The mention could not be updated');
            return;
        }

        echo json_encode([
            'success' => true,
            'handled' => $handled,
            'open' => count(poznoteCollectMentions($userId)),
        ]);
    }

    private function loginUserId(): int
    {
        return (int)(getAuthenticatedUserId() ?? 0);
    }

    private function sendError(int $code, string $message): void
    {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message,
        ]);
    }
}
