import os
from typing import List, Optional


API_BASE = "https://api.example.com"
MAX_RETRIES = 3


class UserService:
    def __init__(self, db):
        self.db = db

    def get_user(self, user_id: str) -> Optional[dict]:
        return self.db.find_one({"id": user_id})

    async def list_users(self) -> List[dict]:
        return await self.db.find_all()


def build_connection(host: str, port: int = 5432) -> dict:
    return {"host": host, "port": port}


async def health_check() -> str:
    return "ok"
