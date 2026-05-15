import unittest

from config_loader import ZaloConfig
from zalo_service import ServiceError, ValidationError, ZaloService


class FakeMessage:
    def __init__(self, text):
        self.text = text


class FakeZaloClient:
    def __init__(self):
        self.sent = []
        self.fetch_group_info_arg = None

    def isLoggedIn(self):
        return True

    def fetchAccountInfo(self):
        return {"profile": {"userId": "u-1"}}

    def fetchAllGroups(self):
        return {
            "gridInfoMap": {
                "1": {"grid": "1", "name": "Nhom A", "totalMember": 3},
                "2": {"grid": "2", "name": "Nhom B"},
            }
        }

    def fetchGroupInfo(self, group_id):
        self.fetch_group_info_arg = group_id
        return {"gridInfoMap": {"3": {"grid": "3", "name": "Nhom C", "totalMember": 8}}}

    def send(self, message, thread_id, thread_type, mark_message=None, ttl=0):
        self.sent.append(
            {
                "message": message.text,
                "thread_id": thread_id,
                "thread_type": thread_type,
                "mark_message": mark_message,
                "ttl": ttl,
            }
        )
        return {"msgId": "m-1", "cookie": "should-hide"}


class IdOnlyFakeZaloClient(FakeZaloClient):
    def fetchAllGroups(self):
        return {"gridVerMap": {"3": 0}}


class EmptyBatchFakeZaloClient(FakeZaloClient):
    def __init__(self):
        super().__init__()
        self.fetch_group_info_args = []

    def fetchAllGroups(self):
        return {"gridVerMap": {"3": 0, "4": 0}}

    def fetchGroupInfo(self, group_id):
        self.fetch_group_info_args.append(group_id)
        if isinstance(group_id, dict):
            return {"gridInfoMap": {}}
        return {
            "gridInfoMap": {
                str(group_id): {
                    "grid": str(group_id),
                    "name": f"Nhom {group_id}",
                }
            }
        }


class ZaloServiceTest(unittest.TestCase):
    def test_health_uses_client_status(self):
        service = self._service(FakeZaloClient())

        health = service.health()

        self.assertTrue(health["zalo_logged_in"])
        self.assertTrue(health["zalo_session_verified"])
        self.assertTrue(health["config"]["imei_configured"])

    def test_list_groups_normalizes_grid_info_map(self):
        service = self._service(FakeZaloClient())

        groups, cached = service.list_groups()

        self.assertFalse(cached)
        self.assertEqual([group["id"] for group in groups], ["1", "2"])
        self.assertEqual(groups[0]["name"], "Nhom A")
        self.assertEqual(groups[0]["total_member"], 3)

    def test_list_groups_fetches_details_when_only_ids_are_returned(self):
        client = IdOnlyFakeZaloClient()
        service = self._service(client)

        groups, cached = service.list_groups()

        self.assertFalse(cached)
        self.assertEqual(groups[0]["id"], "3")
        self.assertEqual(groups[0]["name"], "Nhom C")
        self.assertEqual(client.fetch_group_info_arg, {"3": 0})

    def test_list_groups_falls_back_to_single_group_when_batch_is_empty(self):
        client = EmptyBatchFakeZaloClient()
        service = self._service(client)

        groups, cached = service.list_groups()

        self.assertFalse(cached)
        self.assertEqual([group["id"] for group in groups], ["3", "4"])
        self.assertEqual([group["name"] for group in groups], ["Nhom 3", "Nhom 4"])

    def test_send_group_message_validates_and_redacts_result(self):
        client = FakeZaloClient()
        service = self._service(client)

        result = service.send_group_message("1", "Xin chao", ttl=5, mark_message="urgent")

        self.assertEqual(result["msgId"], "m-1")
        self.assertEqual(result["cookie"], "[redacted]")
        self.assertEqual(client.sent[0]["thread_type"], "GROUP")
        self.assertEqual(client.sent[0]["message"], "Xin chao")

    def test_send_group_message_rejects_empty_message(self):
        service = self._service(FakeZaloClient())

        with self.assertRaises(ValidationError):
            service.send_group_message("1", "   ")

    def test_allowed_group_ids_blocks_other_groups(self):
        service = self._service(FakeZaloClient(), allowed_group_ids=["1"])

        with self.assertRaises(ServiceError) as context:
            service.send_group_message("2", "Xin chao")

        self.assertEqual(context.exception.code, "GROUP_NOT_ALLOWED")

    def _service(self, client, allowed_group_ids=None):
        return ZaloService(
            ZaloConfig(imei="imei-test", session_cookies={"cookie": "value"}),
            client=client,
            message_cls=FakeMessage,
            thread_type_group="GROUP",
            min_send_interval_seconds=0,
            allowed_group_ids=allowed_group_ids,
        )


if __name__ == "__main__":
    unittest.main()
