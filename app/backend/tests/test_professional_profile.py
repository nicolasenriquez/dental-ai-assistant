from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient

from backend.auth.dependencies import get_current_user
from backend.db import users_repo
from backend.main import app


async def test_profile_requires_auth_validates_and_updates_only_session_user(monkeypatch) -> None:
    calls: list[tuple[UUID, str | None]] = []

    async def save(user: UUID, name: str | None) -> None:
        calls.append((user, name))

    monkeypatch.setattr(users_repo, "set_professional_display_name", save)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        endpoint = "/api/auth/me/profile"
        assert (
            await client.patch(endpoint, json={"professional_display_name": "Nombre"})
        ).status_code == 401
        owner = uuid4()
        app.dependency_overrides[get_current_user] = lambda: {"id": str(owner)}
        try:
            for body in (
                {"professional_display_name": "x" * 121},
                {"professional_display_name": "Nombre\nOtro"},
                {"professional_display_name": "Nombre", "user_id": str(uuid4())},
                {},
            ):
                assert (await client.patch(endpoint, json=body)).status_code == 422
            assert calls == []
            saved = await client.patch(
                endpoint, json={"professional_display_name": "  Dra. Ríos  "}
            )
            assert saved.status_code == 200
            assert saved.json() == {"professional_display_name": "Dra. Ríos"}
            assert calls == [(owner, "Dra. Ríos")]
            assert (
                await client.patch(endpoint, json={"professional_display_name": " "})
            ).json() == {"professional_display_name": None}
            assert calls[-1] == (owner, None)
        finally:
            app.dependency_overrides.pop(get_current_user, None)
