"""GLOBAL_SETTING_KEYS must list every key the Poznote API treats as global.

A global key missing from it is not refused to a non-administrator caller by
the MCP server, and the API cannot refuse it either: it sees the service
token, an administrator. The list had fallen behind the PHP one (#1681 review).
"""

import re
import unittest
from pathlib import Path

from poznote_mcp import server

PHP = Path(__file__).resolve().parents[2] / "src/api/v1/controllers/SettingsController.php"


class GlobalSettingKeysTests(unittest.TestCase):
    @unittest.skipUnless(PHP.is_file(), "needs the Poznote checkout next to the MCP server")
    def test_every_php_global_setting_is_known_to_the_mcp_server(self):
        block = re.search(r"private \$globalSettings = \[(.*?)\];", PHP.read_text(encoding="utf-8"), re.S)
        self.assertIsNotNone(block, "SettingsController::$globalSettings not found")
        php_keys = set(re.findall(r"'([a-z0-9_]+)'", block.group(1)))
        self.assertEqual(sorted(php_keys - server.GLOBAL_SETTING_KEYS), [])


if __name__ == "__main__":
    unittest.main()
