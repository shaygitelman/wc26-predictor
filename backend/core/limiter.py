from slowapi import Limiter
from starlette.requests import Request


def _get_real_ip(request: Request) -> str:
    """
    Return the client's real IP behind Render/Vercel proxies.
    Render sets X-Forwarded-For; we take only the first (leftmost) address
    which is the original client and cannot be spoofed by the client itself
    when the proxy is trusted.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


limiter = Limiter(key_func=_get_real_ip)
