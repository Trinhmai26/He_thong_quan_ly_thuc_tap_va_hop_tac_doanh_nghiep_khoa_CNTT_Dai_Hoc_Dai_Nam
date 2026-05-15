import json
import tempfile
import unittest
from pathlib import Path

from config_loader import ConfigError, load_config


class ConfigLoaderTest(unittest.TestCase):
    def test_loads_top_level_object(self):
        path = self._write_config(
            {
                "imei": "imei-1",
                "session_cookies": {"cookie": "value"},
                "phone": "phone",
                "password": "password",
            }
        )

        config = load_config(str(path))

        self.assertEqual(config.imei, "imei-1")
        self.assertEqual(config.session_cookies, {"cookie": "value"})
        self.assertEqual(config.phone, "phone")
        self.assertEqual(config.password, "password")

    def test_loads_first_item_from_array(self):
        path = self._write_config(
            [{"api_key": "api", "secret_key": "secret", "imei": "imei-2", "session_cookies": {"a": "b"}}]
        )

        config = load_config(str(path))

        self.assertEqual(config.imei, "imei-2")
        self.assertEqual(config.phone, "api")
        self.assertEqual(config.password, "secret")
        self.assertEqual(config.api_key, "api")
        self.assertEqual(config.secret_key, "secret")
        self.assertTrue(config.secret_key_configured)

    def test_falls_back_to_cookie_login_placeholders(self):
        path = self._write_config({"imei": "imei-4", "session_cookies": {"a": "b"}})

        config = load_config(str(path))

        self.assertEqual(config.phone, "cookie_login")
        self.assertEqual(config.password, "cookie_login")
        self.assertFalse(config.secret_key_configured)

    def test_rejects_missing_cookies(self):
        path = self._write_config({"imei": "imei-3"})

        with self.assertRaises(ConfigError):
            load_config(str(path))

    def _write_config(self, data):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / "config.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
