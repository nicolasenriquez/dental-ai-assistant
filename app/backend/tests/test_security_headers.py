"""Security headers required by GIS, Picker, and the application shell."""

from httpx import ASGITransport, AsyncClient

from backend.main import CONTENT_SECURITY_POLICY, app


def _directives(policy: str) -> dict[str, list[str]]:
    return {
        parts[0]: parts[1:]
        for parts in (directive.strip().split() for directive in policy.split(";"))
        if parts
    }


async def test_application_responses_include_security_headers() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/config")

    assert response.headers["content-security-policy"] == CONTENT_SECURITY_POLICY
    assert response.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


async def test_csp_has_only_reviewed_provider_sources() -> None:
    directives = _directives(CONTENT_SECURITY_POLICY)

    assert directives["default-src"] == ["'self'"]
    assert directives["base-uri"] == ["'self'"]
    assert directives["object-src"] == ["'none'"]
    assert directives["frame-ancestors"] == ["'none'"]
    assert directives["script-src"] == [
        "'self'",
        "https://accounts.google.com/gsi/client",
        "https://apis.google.com/js/api.js",
        "https://apis.google.com/_/scs/",
    ]
    assert directives["style-src"] == [
        "'self'",
        "https://fonts.googleapis.com",
        "https://accounts.google.com/gsi/style",
    ]
    assert directives["style-src-elem"] == [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://accounts.google.com/gsi/style",
    ]
    assert directives["style-src-attr"] == ["'unsafe-inline'"]
    assert directives["font-src"] == ["'self'", "https://fonts.gstatic.com"]
    assert directives["img-src"] == ["'self'", "data:"]
    assert directives["connect-src"] == ["'self'", "https://accounts.google.com/gsi/"]
    assert directives["frame-src"] == [
        "'self'",
        "https://accounts.google.com/gsi/",
        "https://docs.google.com/picker",
        "https://www.youtube.com/embed/",
    ]
    assert directives["form-action"] == ["'self'"]

    assert "*" not in CONTENT_SECURITY_POLICY
    assert "unsafe-eval" not in CONTENT_SECURITY_POLICY
    assert "'unsafe-inline'" not in " ".join(directives["script-src"])
