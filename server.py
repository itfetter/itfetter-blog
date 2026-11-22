import argparse
import secrets
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parent
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}
SESSION_COOKIE = "itfetter_session"
SESSIONS = set()
# These are the requested defaults for the loopback-only preview.
ADMIN_USERNAME = "amdin"
ADMIN_PASSWORD = "123456"


class BlogHandler(BaseHTTPRequestHandler):
    def session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        session = cookie.get(SESSION_COOKIE)
        return session.value if session else None

    def send_content(self, status, content, content_type, *, private=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if private:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def render_admin(self, *, signed_in=False, error=False):
        if signed_in:
            title = "写作台"
            action = '<form method="post" action="/admin/logout"><button class="secondary" type="submit">退出登录</button></form>'
            body = (ROOT / "studio.html").read_text(encoding="utf-8")
        else:
            title = "登录写作台"
            action = '<a class="secondary" href="/">返回博客</a>'
            feedback = '<p class="form-error" role="alert">账号或密码错误，请重试。</p>' if error else ""
            body = f'''<section class="admin-login" aria-labelledby="login-title">
              <h1 id="login-title">登录写作台</h1>
              <p class="subtle">登录后即可编辑和导出本地草稿。</p>
              <form class="admin-form" method="post" action="/admin/login">
                {feedback}
                <label for="username">账号</label>
                <input id="username" name="username" autocomplete="username" required autofocus>
                <label for="password">密码</label>
                <input id="password" name="password" type="password" autocomplete="current-password" required>
                <button class="primary" type="submit">登录</button>
              </form>
            </section>'''

        page = f'''<!doctype html>
        <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>{title} · itfetter</title>
          <script>
            try {{
              const theme = localStorage.getItem('itfetter-theme');
              if (theme) document.documentElement.dataset.theme = theme;
            }} catch {{}}
          </script>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
          <header class="header"><div class="wrap admin-header">
            <a class="brand" href="/"><span class="mark" aria-hidden="true">&gt;_</span>itfetter</a>
            {action}
          </div></header>
          <main class="wrap">{body}</main>
        </body>
        </html>'''
        status = HTTPStatus.UNAUTHORIZED if error else HTTPStatus.OK
        self.send_content(status, page.encode("utf-8"), "text/html; charset=utf-8", private=True)

    def redirect_to_admin(self, cookie=None):
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/admin")
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self.send_content(HTTPStatus.OK, (ROOT / filename).read_bytes(), content_type)
        elif path == "/admin":
            self.render_admin(signed_in=self.session_token() in SESSIONS)
        elif path == "/admin/":
            self.redirect_to_admin()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    do_HEAD = do_GET

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/admin/logout":
            SESSIONS.discard(self.session_token())
            self.redirect_to_admin(f"{SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0")
            return
        if path != "/admin/login":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= 4096:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        form = parse_qs(self.rfile.read(int(length)).decode("utf-8", errors="replace"))
        if form.get("username") != [ADMIN_USERNAME] or form.get("password") != [ADMIN_PASSWORD]:
            self.render_admin(error=True)
            return

        SESSIONS.discard(self.session_token())
        token = secrets.token_urlsafe(32)
        SESSIONS.add(token)
        self.redirect_to_admin(f"{SESSION_COOKIE}={token}; Path=/admin; HttpOnly; SameSite=Strict")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the itfetter localhost blog preview.")
    parser.add_argument("--port", type=int, default=8081)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), BlogHandler) as server:
        print(f"Blog preview: http://127.0.0.1:{server.server_port}/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
