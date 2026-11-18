"""A transferred menu package succeeds only when the watch loads it."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import coffeeshop_menu_app as admin
except ModuleNotFoundError as exc:
    if exc.name == "flask":
        raise unittest.SkipTest("Watch updater tests require Flask.") from exc
    raise


class WatchUpdateTests(unittest.TestCase):
    def update(self, output, *, dry_run=False, returncode=0):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("generate_watch_data.py", "upload_watch_map.py", "database.sqlite", "locations.csv"):
                (root / name).touch()
            generated = subprocess.CompletedProcess([], 0, "Generated menus", "")
            uploaded = subprocess.CompletedProcess([], returncode, output, "")
            with patch.object(admin.subprocess, "run", side_effect=[generated, uploaded]):
                return admin.run_watch_update(str(root), str(root / "database.sqlite"),
                                              str(root / "locations.csv"), upload=True, dry_run=dry_run)

    def test_watch_rejection_is_a_failure_despite_successful_transfer(self):
        result = self.update("Finished: BFMAP_DONE_OK 9367552 map=1 logos=1 menus=0")
        self.assertFalse(result["ok"])
        self.assertFalse(result["uploaded"])
        self.assertIn("did not confirm", result["stderr"])

    def test_loaded_menu_is_successful(self):
        result = self.update("Finished: BFMAP_DONE_OK 9367552 map=1 logos=1 menus=1")
        self.assertTrue(result["ok"])
        self.assertTrue(result["uploaded"])

    def test_missing_confirmation_is_not_successful(self):
        self.assertFalse(self.update("Uploaded 36,829 bytes")["ok"])

    def test_dry_run_needs_no_device_confirmation(self):
        result = self.update("Dry run complete; nothing was uploaded.", dry_run=True)
        self.assertTrue(result["ok"])
        self.assertFalse(result["uploaded"])

    def test_failed_process_remains_failed(self):
        result = self.update("menus=1", returncode=2)
        self.assertFalse(result["ok"])
        self.assertFalse(result["uploaded"])


if __name__ == "__main__":
    unittest.main()
