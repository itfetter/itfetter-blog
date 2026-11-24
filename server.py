import argparse
import json
import os
import secrets
import sqlite3
from hashlib import pbkdf2_hmac
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from content_store import DATA, MEDIA_URL, database, initialize_store, public_script, read_content, save_change, store_comments, store_engagement


ROOT = Path(__file__).resolve().parent
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/markdown.js": ("markdown.js", "text/javascript; charset=utf-8"),
    "/assets/ai-workflow.jpg": ("assets/ai-workflow.jpg", "image/jpeg"),
    "/assets/first-release.jpg": ("assets/first-release.jpg", "image/jpeg"),
    "/assets/markdown-preview.jpg": ("assets/markdown-preview.jpg", "image/jpeg"),
    "/assets/local-metrics.jpg": ("assets/local-metrics.jpg", "image/jpeg"),
    "/assets/itfetter-icon.svg": ("assets/itfetter-icon.svg", "image/svg+xml"),
}
SESSION_COOKIE = "itfetter_session"
VISITOR_COOKIE = "itfetter_reader"
SESSIONS = set()
AUTH_LOCK = Lock()
UPLOAD_DIR = DATA.parent / "uploads"
IMAGE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
PASSWORD_HASH_FILE = DATA.with_name("admin-password.hash")
# These are the requested defaults for the loopback-only preview.
ADMIN_USERNAME = os.environ.get("BLOG_ADMIN_USERNAME", "admin")
PREVIEW_PASSWORD = os.environ.get("BLOG_PREVIEW_PASSWORD")
ADMIN_PASSWORD = PREVIEW_PASSWORD or secrets.token_urlsafe(12)
PASSWORD_HASH = b""
COOKIE_SECURITY = ""

def password_hash(password, salt):
    return pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)


def password_matches(password):
    if PASSWORD_HASH:
        salt, digest = PASSWORD_HASH[:16], PASSWORD_HASH[16:]
        return secrets.compare_digest(password_hash(password, salt), digest)
    return secrets.compare_digest(password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8"))


class BlogHandler(BaseHTTPRequestHandler):
    def session_token(self):
        return self.cookie_value(SESSION_COOKIE)

    def cookie_value(self, name):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        entry = cookie.get(name)
        return entry.value if entry else None

    def send_content(self, status, content, content_type, *, private=False, cookie=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if private:
            self.send_header("Cache-Control", "no-store")
        if content_type.startswith("image/"):
            self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def render_admin(self, *, signed_in=False, error=False, password_changed=False):
        if signed_in:
            title = "博客管理"
            action = '<div class="admin-header-actions"><a class="secondary" href="/" target="_blank" rel="noopener">查看博客</a><form method="post" action="/admin/logout"><button class="secondary" type="submit">退出登录</button></form></div>'
            body = (ROOT / "studio.html").read_text(encoding="utf-8")
        else:
            title = "登录写作台"
            action = '<a class="secondary" href="/">返回博客</a>'
            feedback = '<p class="form-error" role="alert">账号或密码错误，请重试。</p>' if error else ""
            if password_changed:
                feedback = '<p class="admin-feedback" role="status">密码已修改，请使用新密码登录。</p>'
            body = f'''<section class="admin-login" aria-labelledby="login-title">
              <h1 id="login-title">登录写作台</h1>
              <p class="subtle">登录后管理文章、笔记、项目和站点设置。</p>
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
          <link rel="icon" type="image/svg+xml" href="/assets/itfetter-icon.svg">
        </head>
        <body>
          <header class="header"><div class="wrap admin-header">
            <a class="brand" href="/"><img class="mark" src="/assets/itfetter-icon.svg" alt="" width="31" height="31">itfetter</a>
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

    def send_json(self, status, data, *, cookie=None):
        self.send_content(status, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", private=True, cookie=cookie)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self.send_content(HTTPStatus.OK, (ROOT / filename).read_bytes(), content_type)
        elif path == "/content.js":
            with database() as db:
                content = public_script(read_content(db, public=True))
            self.send_content(HTTPStatus.OK, content.encode("utf-8"), "text/javascript; charset=utf-8", private=True)
        elif path.startswith(("/media/", "/admin/media/")):
            self.serve_image(path)
        elif path == "/api/comments":
            self.handle_comments()
        elif path in ("/admin/content", "/admin/editor.js"):
            if self.session_token() not in SESSIONS:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新登录后台。"})
            elif path == "/admin/content":
                with database() as db:
                    data = read_content(db)
                self.send_json(HTTPStatus.OK, data)
            else:
                self.send_content(HTTPStatus.OK, (ROOT / "admin.js").read_bytes(), "text/javascript; charset=utf-8", private=True)
        elif path == "/admin":
            query = parse_qs(urlsplit(self.path).query)
            self.render_admin(signed_in=self.session_token() in SESSIONS, password_changed=query.get("password") == ["changed"])
        elif path == "/admin/":
            self.redirect_to_admin()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    do_HEAD = do_GET

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/admin/content":
            self.save_admin_content()
            return
        if path == "/admin/password":
            self.change_password()
            return
        if path == "/admin/media":
            self.upload_image()
            return
        if path == "/api/comments":
            self.handle_comments()
            return
        if path == "/api/post-stats":
            self.handle_post_stats()
            return
        if path == "/admin/logout":
            SESSIONS.discard(self.session_token())
            self.redirect_to_admin(f"{SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0{COOKIE_SECURITY}")
            return
        if path != "/admin/login":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= 4096:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        form = parse_qs(self.rfile.read(int(length)).decode("utf-8", errors="replace"))
        passwords = form.get("password", [])
        with AUTH_LOCK:
            token = None
            if form.get("username") == [ADMIN_USERNAME] and len(passwords) == 1 and password_matches(passwords[0]):
                SESSIONS.discard(self.session_token())
                token = secrets.token_urlsafe(32)
                SESSIONS.add(token)
        if not token:
            self.render_admin(error=True)
            return
        self.redirect_to_admin(f"{SESSION_COOKIE}={token}; Path=/admin; HttpOnly; SameSite=Strict{COOKIE_SECURITY}")

    def change_password(self):
        global PASSWORD_HASH
        if self.session_token() not in SESSIONS:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新登录后台。"})
            return
        try:
            length = self.headers.get("Content-Length", "")
            if self.headers.get_content_type() != "application/json" or not length.isdecimal() or not 0 < int(length) <= 4096:
                raise ValueError("密码请求格式有误。")
            fields = json.loads(self.rfile.read(int(length)))
            if not isinstance(fields, dict):
                raise ValueError("密码请求格式有误。")
            current, new, confirm = (fields.get(key) for key in ("current", "new", "confirm"))
            if not isinstance(current, str) or not current or not isinstance(new, str) or not 6 <= len(new) <= 256 or not new.strip():
                raise ValueError("请填写当前密码，新密码需要 6 至 256 个字符。")
            if new != confirm:
                raise ValueError("两次输入的新密码不一致。")
            if new == current:
                raise ValueError("新密码需要与当前密码不同。")
            with AUTH_LOCK:
                if self.session_token() not in SESSIONS:
                    self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新登录后台。"})
                    return
                if not password_matches(current):
                    raise ValueError("当前密码不正确。")
                salt = secrets.token_bytes(16)
                record = salt + password_hash(new, salt)
                pending = PASSWORD_HASH_FILE.with_suffix(".tmp")
                with os.fdopen(os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as output:
                    output.write(record)
                pending.replace(PASSWORD_HASH_FILE)
                PASSWORD_HASH = record
                SESSIONS.clear()
        except (ValueError, UnicodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        except OSError:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "密码未能保存，请检查数据目录是否可写。"})
            return
        self.send_json(HTTPStatus.OK, {"changed": True}, cookie=f"{SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0{COOKIE_SECURITY}")

    def handle_post_stats(self):
        post_id = parse_qs(urlsplit(self.path).query).get("post", [""])[0]
        length = self.headers.get("Content-Length", "")
        try:
            if self.headers.get_content_type() != "application/json" or not length.isdecimal() or not 0 < int(length) <= 128:
                raise ValueError("文章统计请求格式有误。")
            action = json.loads(self.rfile.read(int(length)))
            if action not in ("view", "like", "unlike"):
                raise ValueError("未知的统计操作。")
            visitor = self.cookie_value(VISITOR_COOKIE)
            cookie = None
            if not visitor or len(visitor) != 32 or any(char not in "0123456789abcdef" for char in visitor):
                visitor = secrets.token_hex(16)
                cookie = f"{VISITOR_COOKIE}={visitor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000{COOKIE_SECURITY}"
            with database(write=True) as db:
                stats = store_engagement(db, post_id, visitor, action)
        except LookupError as error:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
        except (ValueError, UnicodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except (OSError, sqlite3.Error):
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "文章统计暂时无法读取或保存。"})
        else:
            self.send_json(HTTPStatus.OK, stats, cookie=cookie)

    def handle_comments(self):
        post_id = parse_qs(urlsplit(self.path).query).get("post", [""])[0]
        try:
            if self.command == "POST":
                length = self.headers.get("Content-Length", "")
                if self.headers.get_content_type() != "application/json" or not length.isdecimal() or not 0 < int(length) <= 26000:
                    raise ValueError("评论格式有误或内容过长。")
                payload = json.loads(self.rfile.read(int(length)))
            submit = self.command == "POST"
            with database(write=submit) as db:
                comments = store_comments(db, post_id, payload if submit else None, submit)
        except LookupError as error:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
        except (ValueError, UnicodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except (OSError, sqlite3.Error):
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "评论暂时无法读取或保存。"})
        else:
            self.send_json(HTTPStatus.OK, comments)

    def save_admin_content(self):
        if self.session_token() not in SESSIONS:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新登录后台。"})
            return
        length = self.headers.get("Content-Length", "")
        if self.headers.get_content_type() != "application/json" or not length.isdecimal() or not 0 < int(length) <= 750000:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "提交内容格式有误或过长。"})
            return
        try:
            change = json.loads(self.rfile.read(int(length)))
            with database(write=True) as db:
                data = save_change(db, change)
        except (ValueError, UnicodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        except (OSError, sqlite3.Error):
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "文件未能保存，请检查项目目录是否可写。"})
            return
        self.send_json(HTTPStatus.OK, data)

    def upload_image(self):
        if self.session_token() not in SESSIONS:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "请重新登录后台。"})
            return
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= MAX_IMAGE_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "每张图片最大 8 MB。"})
            return
        content = self.rfile.read(int(length))
        kind = next((ext for ext, magic in (("png", b"\x89PNG\r\n\x1a\n"), ("jpg", b"\xff\xd8\xff"),
                                           ("gif", b"GIF87a"), ("gif", b"GIF89a")) if content.startswith(magic)), None)
        if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
            kind = "webp"
        if len(content) != int(length) or not kind:
            self.send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "请选择 PNG、JPEG、WebP 或 GIF 图片。"})
            return
        name = f"{secrets.token_hex(16)}.{kind}"
        try:
            UPLOAD_DIR.mkdir(exist_ok=True)
            (UPLOAD_DIR / name).write_bytes(content)
        except OSError:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "图片保存失败，请重试。"})
            return
        self.send_json(HTTPStatus.CREATED, {"url": f"/media/{name}"})

    def serve_image(self, path):
        private = path.startswith("/admin/")
        match = MEDIA_URL.fullmatch(path.removeprefix("/admin"))
        if not match or (private and self.session_token() not in SESSIONS):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        name = match[1]
        if not private:
            with database() as db:
                published = db.execute("SELECT 1 FROM public_media WHERE name=? LIMIT 1", (name,)).fetchone()
            if not published:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        try:
            content = (UPLOAD_DIR / name).read_bytes()
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_content(HTTPStatus.OK, content, IMAGE_TYPES[name.rsplit(".", 1)[1]], private=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the itfetter localhost blog preview.")
    parser.add_argument("--port", type=int, default=os.environ.get("BLOG_PORT", "8081"))
    parser.add_argument("--production", action="store_true", help="Require a dedicated password file and HTTPS cookies.")
    args = parser.parse_args()
    if PASSWORD_HASH_FILE.exists():
        PASSWORD_HASH = PASSWORD_HASH_FILE.read_bytes()
        if len(PASSWORD_HASH) != 48:
            parser.error("The stored admin password hash has an invalid format.")
    if args.production:
        if not ADMIN_USERNAME.strip():
            parser.error("Production requires an admin username.")
        if not PASSWORD_HASH:
            try:
                password_file = Path(os.environ.get("BLOG_ADMIN_PASSWORD_FILE", "/run/secrets/blog-admin-password"))
                ADMIN_PASSWORD = password_file.read_text(encoding="utf-8").rstrip("\r\n")
            except OSError:
                parser.error("Could not read the production admin password file.")
            if len(ADMIN_PASSWORD) < 16:
                parser.error("Production requires an initial password with at least 16 characters.")
        COOKIE_SECURITY = "; Secure"
    initialize_store()
    with ThreadingHTTPServer(("127.0.0.1", args.port), BlogHandler) as server:
        print(f"Blog preview: http://127.0.0.1:{server.server_port}/")
        if not args.production:
            print(f"Local preview login name: {ADMIN_USERNAME}")
            if not PASSWORD_HASH and not PREVIEW_PASSWORD:
                print(f"Temporary local preview password: {ADMIN_PASSWORD}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
